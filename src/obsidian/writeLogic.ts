/**
 * PURE write logic. The risky, file-mutating algorithms live
 * here as plain string→string functions so they can be exhaustively unit-tested
 * — there is no Obsidian/IO here. The thin `writer.ts` glue calls these inside
 * `Vault.process`.
 *
 * Centerpiece: `placeTodoInProject` — the materialized-view section sync. It
 * moves a todo line under the status section matching its new status, scoped to
 * the todo's subproject block, creating the header (in column order) if missing.
 */
import {
  type Status,
  type Todo,
  type TodoRecord,
  STATUS_LABELS,
  STATUS_ORDER,
  statusFromLabel,
  statusOf,
} from "../core/types";
import { parseTodoLine } from "../core/parse";
import { itemEndOf } from "../core/span";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface HeadingInfo {
  line: number;
  level: number;
  text: string;
  isStatus: boolean;
  status: Status | null;
}

/**
 * Map a heading's text to a Status if it matches a status label (or a legacy one
 * such as `Progress`, see `statusFromLabel`), else null.
 */
export function statusOfHeading(text: string): Status | null {
  return statusFromLabel(text);
}

/**
 * Rename status headings still carrying a legacy label (`### Progress` →
 * `### Doing`) to today's, keeping their level. Frontmatter is skipped; the line
 * count never changes. Returns `lines` itself when nothing did.
 */
export function renameLegacyStatusHeadings(lines: string[]): string[] {
  let out: string[] | null = null;
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[2].trim();
    const st = statusFromLabel(text);
    if (st === null || text === STATUS_LABELS[st]) continue;
    out ??= lines.slice();
    out[i] = `${m[1]} ${STATUS_LABELS[st]}`;
  }
  return out ?? lines;
}

/** Parse all ATX headings into a structured model. */
export function parseHeadings(lines: string[]): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[2].trim();
    const status = statusOfHeading(text);
    out.push({ line: i, level: m[1].length, text, isStatus: status !== null, status });
  }
  return out;
}

/** Index where the body starts, skipping a leading YAML frontmatter block. */
function bodyStart(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  for (let i = 1; i < lines.length; i++) if (lines[i] === "---") return i + 1;
  return 0;
}

/**
 * Locate the line index of a todo in the CURRENT file lines, robust to a stale
 * index: prefer the capsule id, then the stored line if it still matches, then a
 * content scan. Returns -1 if not found (caller must abort the write).
 */
export function findTodoLine(
  lines: string[],
  todo: { id: string | null; line: number; displayText: string; glyph: string },
): number {
  if (todo.id) {
    const needle = `id=${todo.id}`;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle) && parseTodoLine(lines[i]) !== null) return i;
    }
  }
  const at = lines[todo.line];
  if (at !== undefined) {
    const p = parseTodoLine(at);
    if (p && p.id === todo.id && p.displayText === todo.displayText && p.glyph === todo.glyph) {
      return todo.line;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const p = parseTodoLine(lines[i]);
    if (p && p.id === todo.id && p.displayText === todo.displayText && p.glyph === todo.glyph) {
      return i;
    }
  }
  return -1;
}

/** Set of managed todo ids present in a file's text (safety invariant). */
export function managedIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const line of text.split("\n")) {
    const t = parseTodoLine(line);
    if (t?.id) ids.add(t.id);
  }
  return ids;
}

function blockEndOf(headings: HeadingInfo[], sp: HeadingInfo, len: number): number {
  for (const h of headings) {
    if (h.line > sp.line && h.level <= sp.level) return h.line;
  }
  return len;
}

function sectionEndOf(headings: HeadingInfo[], sec: HeadingInfo, blockEnd: number): number {
  for (const h of headings) {
    if (h.line > sec.line && h.level <= sec.level && h.line < blockEnd) return h.line;
  }
  return blockEnd;
}

function nearestSubprojectHeading(
  headings: HeadingInfo[],
  name: string,
  near: number,
): HeadingInfo | undefined {
  const matches = headings.filter((h) => !h.isStatus && h.text === name);
  if (matches.length === 0) return undefined;
  const above = matches.filter((h) => h.line <= near);
  return above.length ? above[above.length - 1] : matches[0];
}

/**
 * The nearest non-status ANCESTOR heading (subproject) for the line at `lineIdx`,
 * computed from the file's CURRENT lines. The writer uses this instead of the
 * index snapshot's `subproject` so placement is correct even when the snapshot is
 * stale OR the file was just converted into a project (its cached subproject
 * was computed under non-project semantics, where `### Progress` looked like a
 * subproject). Mirrors indexFileTodos's ancestor walk.
 */
export function subprojectOf(lines: string[], lineIdx: number): string | null {
  const stack: { level: number; isStatus: boolean; text: string }[] = [];
  for (let i = 0; i < lineIdx && i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const isStatus = statusOfHeading(text) !== null;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, isStatus, text });
  }
  for (let s = stack.length - 1; s >= 0; s--) {
    if (!stack[s].isStatus) return stack[s].text;
  }
  return null;
}

/** Line index of the nearest enclosing STATUS heading for `lineIdx`, or -1. */
function statusSectionLineOf(lines: string[], lineIdx: number): number {
  const stack: { level: number; line: number; isStatus: boolean }[] = [];
  for (let i = 0; i < lineIdx && i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, line: i, isStatus: statusOfHeading(m[2].trim()) !== null });
  }
  for (let s = stack.length - 1; s >= 0; s--) if (stack[s].isStatus) return stack[s].line;
  return -1;
}

// The item-span rule lives in `core/span.ts` so the indexer and both writers
// share one definition of what a todo owns.
const itemEnd = itemEndOf;

/**
 * Within-column reorder (shared by the plugin board and the app board): move
 * the todo at `fromIdx` (with its indented sub-lines) directly before or after
 * the todo at `anchorIdx` in the same note. A PURE reorder: the two must share
 * status, indent, status section and subproject block, so the move can never
 * change what the todo is — anything else returns null (a status change goes
 * through `placeTodoInProject` instead).
 */
export function reorderTodoLine(
  lines: string[],
  fromIdx: number,
  anchorIdx: number,
  position: "before" | "after",
): string[] | null {
  if (fromIdx === anchorIdx) return null;
  const moved = parseTodoLine(lines[fromIdx] ?? "");
  const anchor = parseTodoLine(lines[anchorIdx] ?? "");
  if (!moved || !anchor) return null;
  if (statusOf(moved) !== statusOf(anchor) || moved.indent !== anchor.indent) return null;
  if (
    statusSectionLineOf(lines, fromIdx) !== statusSectionLineOf(lines, anchorIdx) ||
    subprojectOf(lines, fromIdx) !== subprojectOf(lines, anchorIdx)
  ) {
    return null;
  }
  const movedEnd = itemEnd(lines, fromIdx);
  if (anchorIdx > fromIdx && anchorIdx < movedEnd) return null; // anchor is inside the moved item
  const block = lines.slice(fromIdx, movedEnd);
  const rest = [...lines.slice(0, fromIdx), ...lines.slice(movedEnd)];
  const anchorInRest = anchorIdx > fromIdx ? anchorIdx - block.length : anchorIdx;
  const at = position === "before" ? anchorInRest : itemEnd(rest, anchorInRest);
  const out = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  return out.join("\n") === lines.join("\n") ? null : out;
}

/**
 * Remove the todo line at `fromIndex` and re-insert `newLine` under the status
 * section for `newStatus`, scoped to the todo's `subproject` block. Creates the
 * section header (correct level + column order) if it doesn't exist.
 */
export function placeTodoInProject(
  lines: string[],
  fromIndex: number,
  subproject: string | null,
  newStatus: Status,
  newLine: string,
  subLines?: readonly string[],
): string[] {
  // A placement also brings the note's status headings up to date (`Progress` → `Doing`).
  const work = renameLegacyStatusHeadings(lines).slice();
  // A todo is its line PLUS what is indented under it — its note and any
  // sub-items. Move the whole span, or the note is stranded under the old
  // heading with nothing to report it. When the caller supplies `subLines` (an
  // insert with no source line, e.g. a cross-note move) they are carried as-is.
  let carried: readonly string[] = subLines ?? [];
  if (fromIndex >= 0 && fromIndex < work.length) {
    const spanEnd = itemEnd(work, fromIndex);
    if (subLines === undefined) carried = work.slice(fromIndex + 1, spanEnd);
    work.splice(fromIndex, spanEnd - fromIndex);
  }

  const headings = parseHeadings(work);

  let blockStart: number;
  let blockEnd: number;
  let subLevel = 1;

  if (subproject) {
    const sp = nearestSubprojectHeading(headings, subproject, fromIndex);
    if (sp) {
      subLevel = sp.level;
      blockStart = sp.line + 1;
      blockEnd = blockEndOf(headings, sp, work.length);
    } else {
      // subproject heading missing — fall back to body region
      blockStart = bodyStart(work);
      blockEnd = work.length;
    }
  } else {
    blockStart = bodyStart(work);
    const firstSub = headings.find((h) => !h.isStatus);
    blockEnd = firstSub ? firstSub.line : work.length;
  }

  const statusHeadsInBlock = headings.filter(
    (h) => h.isStatus && h.line >= blockStart && h.line < blockEnd,
  );

  const target = statusHeadsInBlock.find((h) => h.status === newStatus);
  if (target) {
    // Insert snug under the section's last non-blank line, not at the raw section
    // boundary. The boundary is the next heading's line, which can sit AFTER a
    // blank separator — inserting there detaches the todo from its section (and
    // drifts further on each subsequent move). Walk back over trailing blanks,
    // but never above the section header itself.
    let insertAt = sectionEndOf(headings, target, blockEnd);
    while (insertAt > target.line + 1 && work[insertAt - 1].trim() === "") insertAt--;
    work.splice(insertAt, 0, newLine, ...carried);
    return work;
  }

  // Create the missing status header, in column order among sibling sections.
  // Prefer matching the level of existing sibling status sections so the new one
  // stays nested in the same block; only derive from the subproject when there
  // are no siblings to match.
  const headerLevel =
    statusHeadsInBlock.length > 0
      ? statusHeadsInBlock[0].level
      : subproject
        ? subLevel + 1
        : 2;
  const headerLine = `${"#".repeat(headerLevel)} ${STATUS_LABELS[newStatus]}`;
  const newOrder = STATUS_ORDER.indexOf(newStatus);

  let insertHeaderAt = blockEnd;
  if (statusHeadsInBlock.length === 0) {
    insertHeaderAt = blockStart;
  } else {
    for (const h of statusHeadsInBlock) {
      if (h.status && STATUS_ORDER.indexOf(h.status) > newOrder) {
        insertHeaderAt = h.line;
        break;
      }
    }
  }

  work.splice(insertHeaderAt, 0, headerLine, newLine, ...carried);
  return work;
}

// ── Heal rule decision (pure) ───────────────────────────────────────────────────

export type HealAction = "none" | "section-wins" | "glyph-wins";

/**
 * Given a managed todo's previous vs current (section status, glyph status),
 * decide how to reconcile a MANUAL edit:
 *  - section changed, glyph same  → section-wins (update glyph to the section)
 *  - glyph changed, section same  → glyph-wins  (move line under matching section)
 *  - both changed, now consistent → none
 *  - both changed, inconsistent   → glyph-wins
 */
export function healDecision(
  prevSection: Status | null,
  prevGlyph: Status,
  currSection: Status | null,
  currGlyph: Status,
): HealAction {
  const sectionChanged = prevSection !== currSection;
  const glyphChanged = prevGlyph !== currGlyph;
  if (!sectionChanged && !glyphChanged) return "none";
  if (currSection !== null && currSection === currGlyph) return "none";
  if (sectionChanged && !glyphChanged) return "section-wins";
  if (glyphChanged && !sectionChanged) return "glyph-wins";
  return "glyph-wins";
}

export interface HealOp {
  id: string;
  action: Exclude<HealAction, "none">;
  /**
   * section-wins → set the glyph to this (the status of the section the line was
   * moved under). glyph-wins → move the line under the section for this (the
   * status the user typed into the glyph).
   */
  toStatus: Status;
  /** Subproject scope, so a glyph-wins move stays inside the todo's own block. */
  subproject: string | null;
}

/**
 * Diff a project file's PREVIOUS vs CURRENT records (by id) and emit the heal ops
 * needed to reconcile manual edits. Pure — the writer applies
 * the ops in one Vault.process. Only managed todos present in BOTH snapshots are
 * considered: an id-less todo can't be tracked across edits, and a brand-new todo
 * has no prior state to reconcile against.
 */
export function planHeal(
  prior: readonly TodoRecord[],
  next: readonly TodoRecord[],
): HealOp[] {
  const prev = new Map<string, TodoRecord>();
  for (const r of prior) if (r.id) prev.set(r.id, r);

  const ops: HealOp[] = [];
  for (const r of next) {
    if (!r.id) continue;
    const p = prev.get(r.id);
    if (!p) continue;
    const action = healDecision(p.section, statusOf(p), r.section, statusOf(r));
    if (action === "none") continue;
    // section-wins with no current section = the line was dragged out of every
    // status section; there's nothing to sync the glyph to, so leave it be.
    if (action === "section-wins" && r.section === null) continue;
    const toStatus = action === "section-wins" ? (r.section as Status) : statusOf(r);
    ops.push({ id: r.id, action, toStatus, subproject: r.subproject });
  }
  return ops;
}

/**
 * The most statuses one heal may rewrite from their headings. A hand
 * drag moves a todo or two; more at once means the HEADINGS changed under the
 * todos (a label renamed, a section pasted over), and rewriting the glyph — the
 * canonical status — from them would destroy data.
 */
export const MAX_SECTION_WINS = 5;

export interface HealPlan {
  ops: HealOp[];
  /** Section-wins ops withheld by the cap (0 when none were). */
  heldBack: number;
}

/**
 * `planHeal` behind the guards, so the index only applies what is
 * safe. Nothing is planned when:
 *  - the prior snapshot was built under a different format (`indexFormatKey`):
 *    a settings change, not an edit;
 *  - the file was not a project before (it just BECAME one, so every todo's
 *    section flipped null → X at once — not a manual move);
 * and section-wins ops are withheld, all of them, past `MAX_SECTION_WINS`.
 * Glyph-wins ops always pass: they move lines and never change a status.
 */
export function planSafeHeal(
  prior: readonly TodoRecord[],
  next: readonly TodoRecord[],
  priorFormat: string | undefined,
  nextFormat: string,
): HealPlan {
  if (priorFormat !== nextFormat) return { ops: [], heldBack: 0 };
  const wasProject = prior.length > 0 && prior[0].project !== null;
  if (!wasProject) return { ops: [], heldBack: 0 };
  const ops = planHeal(prior, next);
  const sectionWins = ops.filter((op) => op.action === "section-wins").length;
  if (sectionWins <= MAX_SECTION_WINS) return { ops, heldBack: 0 };
  return { ops: ops.filter((op) => op.action !== "section-wins"), heldBack: sectionWins };
}

// Re-exported for the writer's convenience.
export type { Todo };
