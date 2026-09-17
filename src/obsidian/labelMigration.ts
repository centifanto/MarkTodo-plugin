/**
 * Renaming a status label is a MIGRATION, not a preference. PURE.
 *
 * A label names the heading of a status section in every project note, and the
 * heal rule reads statuses off those headings — so changing one in
 * settings without touching the notes leaves every `## Doing` meaning nothing,
 * or something else. The settings tab plans the rename across project notes
 * with `planRelabel`, asks, rewrites the headings, and only then saves the new
 * label, keeping the old one as an alias (`nextStatusAliases`) for notes the
 * rename missed and devices that haven't synced yet.
 */
import {
  type Status,
  type StatusAliases,
  DEFAULT_STATUS_LABELS,
  STATUS_ORDER,
  statusLabelLookup,
} from "../core/types";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** The status (other than `status`) already using `label`, compared the way headings match. */
export function labelTakenBy(
  labels: Record<Status, string>,
  status: Status,
  label: string,
): Status | null {
  const key = label.trim().toLowerCase();
  return STATUS_ORDER.find((st) => st !== status && labels[st].trim().toLowerCase() === key) ?? null;
}

/** Stored aliases (data.json, hand-editable) → valid ones: known statuses, non-empty strings. */
export function parseStatusAliases(raw: unknown): StatusAliases {
  const out: StatusAliases = {};
  if (raw === null || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;
  for (const st of STATUS_ORDER) {
    const list = data[st];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim());
    if (kept.length > 0) out[st] = kept;
  }
  return out;
}

/** A committed label field's value: trimmed, blank = the status's default. */
export function normalizeLabel(status: Status, value: string): string {
  return value.trim() || DEFAULT_STATUS_LABELS[status];
}

/**
 * The aliases after `oldLabels` became `newLabels`: every replaced label joins
 * its status's aliases (newest last, no repeats), and no alias may equal a label
 * that is configured now — on any status. That second rule is what keeps a
 * three-step swap (Blocked → Tmp, Paused → Blocked, Tmp → Paused) from leaving
 * "Blocked" behind as an alias of the wrong status.
 */
export function nextStatusAliases(
  oldLabels: Record<Status, string>,
  oldAliases: StatusAliases,
  newLabels: Record<Status, string>,
): StatusAliases {
  const configured = new Set(STATUS_ORDER.map((st) => newLabels[st].trim().toLowerCase()));
  const out: StatusAliases = {};
  for (const st of STATUS_ORDER) {
    const list = [...(oldAliases[st] ?? [])];
    if (oldLabels[st].trim() !== newLabels[st].trim()) list.push(oldLabels[st].trim());
    const seen = new Set<string>();
    const kept: string[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const key = list[i].trim().toLowerCase();
      if (key === "" || configured.has(key) || seen.has(key)) continue;
      seen.add(key);
      kept.unshift(list[i].trim());
    }
    if (kept.length > 0) out[st] = kept;
  }
  return out;
}

export interface RelabelPlan {
  /** The note's lines with status headings renamed; `lines` itself when none were. */
  lines: string[];
  /** How many headings were renamed. */
  renamed: number;
  /**
   * Headings that were ordinary (a subproject, a note heading) and would BECOME
   * status sections under the new labels — the "renamed Backlog to Ideas while a
   * note has `## Ideas`" case. Their text, in note order.
   */
  collisions: string[];
}

/**
 * Plan one project note's side of a label change. Each heading is read with the
 * OLD labels (what the note meant) and, when it was a status section, rewritten
 * to that status's NEW label — so the level stays and a swap lands on the right
 * headings. A case-only change counts as a rename. Frontmatter is skipped; the
 * line count never changes.
 */
export function planRelabel(
  lines: string[],
  oldLabels: Record<Status, string>,
  oldAliases: StatusAliases,
  newLabels: Record<Status, string>,
  newAliases: StatusAliases,
): RelabelPlan {
  const before = statusLabelLookup(oldLabels, oldAliases);
  const after = statusLabelLookup(newLabels, newAliases);
  let out: string[] | null = null;
  let renamed = 0;
  const collisions: string[] = [];
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[2].trim();
    const was = before.get(text.toLowerCase());
    if (was === undefined) {
      if (after.has(text.toLowerCase())) collisions.push(text);
      continue;
    }
    if (text === newLabels[was]) continue;
    out ??= lines.slice();
    out[i] = `${m[1]} ${newLabels[was]}`;
    renamed++;
  }
  return { lines: out ?? lines, renamed, collisions };
}

function bodyStart(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  for (let i = 1; i < lines.length; i++) if (lines[i] === "---") return i + 1;
  return 0;
}
