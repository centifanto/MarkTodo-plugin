/**
 * Todo spans and note blocks.
 *
 * A todo on a line owns the lines indented under it. Two views of that:
 *
 * - **item span** — the todo line plus EVERY deeper-indented line under it, nested
 *   todo lines included. This is what a *move* carries: relocating a todo must
 *   take its note and any sub-items with it, or they are stranded under whatever
 *   heading the todo used to live in (silently — no parser would complain).
 * - **note block** — the deeper-indented NON-todo lines at the head of the span.
 *   A nested `- [ ]` ends it: sub-todo hierarchy is a separate future feature, not
 *   the note.
 *
 * A blank line ends both. That is the pre-existing reorder rule, and
 * keeping it means one span rule in the codebase rather than two that mostly agree.
 *
 * There is no marker and no capsule key for a note: the block IS the note. A
 * cached "has note" flag would desync the moment someone edited the block in a
 * note editor, so presence is always recomputed from the bytes.
 *
 * PURE — no Obsidian, no IO. Copied byte-identically by the companion app.
 */
import { parseTodoLine } from "./parse";

function indentOf(line: string): number {
  return /^\s*/.exec(line)![0].length;
}

/**
 * Index just past the todo item at `idx`: its line plus any following lines
 * indented deeper (note lines, sub-items). `idx` itself is assumed to be a todo
 * line; a blank line or a line at or left of the todo's indent ends the item.
 */
export function itemEndOf(lines: readonly string[], idx: number): number {
  if (idx < 0 || idx >= lines.length) return Math.max(idx, 0);
  const indent = indentOf(lines[idx]);
  let end = idx + 1;
  while (end < lines.length && lines[end].trim() !== "" && indentOf(lines[end]) > indent) {
    end++;
  }
  return end;
}

/**
 * The raw note lines under the todo at `idx` — the head of its item span, up to
 * the first nested todo line. Empty when the todo has no note.
 */
export function noteLinesOf(lines: readonly string[], idx: number): string[] {
  const end = itemEndOf(lines, idx);
  const out: string[] = [];
  for (let i = idx + 1; i < end; i++) {
    if (parseTodoLine(lines[i])) break; // a nested todo ends the note
    out.push(lines[i]);
  }
  return out;
}

/**
 * The todo's note as display text: its lines with the block's own base indent
 * removed, joined with `\n`. `""` when there is no note.
 *
 * Dedent is by the FIRST note line's indent, and only where a line actually
 * carries that prefix — so a deeper-indented continuation inside the note keeps
 * its relative shape, and a ragged block is never corrupted by over-trimming.
 */
export function noteOf(lines: readonly string[], idx: number): string {
  const raw = noteLinesOf(lines, idx);
  if (raw.length === 0) return "";
  const base = /^\s*/.exec(raw[0])![0];
  return raw
    .map((l) => (base !== "" && l.startsWith(base) ? l.slice(base.length) : l.trimStart()))
    .join("\n")
    .trimEnd();
}

/** Default indent for a new note block: the todo's own indent plus four spaces. */
const NOTE_INDENT = "    ";

/**
 * Rewrite the note block under the todo at `idx`. Returns a NEW lines array, or
 * `null` when nothing would change (so callers can skip the write entirely).
 *
 * `note` is display text — the dedented form `noteOf` returns. It is re-indented
 * under the todo, reusing the existing block's indent when there is one so a
 * hand-indented note keeps its shape, and otherwise the todo's indent + 4.
 *
 * REFUSED (returns null, writes nothing):
 *  - a line that would parse as a todo — it would silently end the note block
 *    and become a sub-todo the person never asked for;
 *  - a line containing `<!--` — it could forge a capsule.
 * Same spirit as `setTitle`, which refuses `<!--` for the same reason.
 */
export function setNoteBlock(
  lines: readonly string[],
  idx: number,
  note: string,
): string[] | null {
  if (idx < 0 || idx >= lines.length) return null;

  const existing = noteLinesOf(lines, idx);
  const body = note.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  // Blank lines are DROPPED, not preserved: a blank ends the block, so a
  // note carrying one could not round-trip — the lines after it would be read
  // as loose text belonging to no todo. Better to normalize on write than to
  // hand back something the next index would disagree with.
  const parts = body === "" ? [] : body.split("\n").filter((p) => p.trim() !== "");

  for (const part of parts) {
    if (part.includes("<!--")) return null;
    if (parseTodoLine(part)) return null;
  }

  const indent =
    existing.length > 0
      ? (/^\s*/.exec(existing[0])![0] ?? NOTE_INDENT)
      : indentOf(lines[idx]) === 0
        ? NOTE_INDENT
        : /^\s*/.exec(lines[idx])![0] + NOTE_INDENT;

  const rendered = parts.map((part) => indent + part.trim());

  const out = [
    ...lines.slice(0, idx + 1),
    ...rendered,
    ...lines.slice(idx + 1 + existing.length),
  ];
  return out.join("\n") === lines.join("\n") ? null : out;
}
