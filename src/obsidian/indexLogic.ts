/**
 * Pure indexing logic: turn a file's TEXT + a little config into
 * `TodoRecord[]`, attaching project/subproject context. No Obsidian, no IO — so
 * it is unit-tested directly with plain strings. The Obsidian glue (index.ts)
 * supplies the text (via cachedRead) and the config (from MetadataCache +
 * settings).
 *
 * Subproject rule: a todo's subproject is the DEEPEST ancestor heading
 * whose name is NOT a status label. Status labels only mean something in a
 * PROJECT file (so `### Doing` is a status section, not a subproject); in an
 * ambient note every heading is a plain grouping.
 */

import { type Status, type TodoRecord, STATUS_LABELS, STATUS_ORDER, statusFromLabel } from "../core/types";
import { parseTodoLine } from "../core/parse";
import { noteOf } from "../core/span";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface IndexFileOptions {
  /**
   * Project name when the file is a project (has the frontmatter key); else null.
   * It also decides whether headings CAN be status sections: in a project a
   * heading matching a status label carries that Status, in an ambient note every
   * heading is a subproject grouping.
   */
  projectName: string | null;
  /** The note's `marktodo-group` — file-level context, like `projectName`. */
  projectGroup?: string | null;
  /** The note's `marktodo-archived`. */
  archived?: boolean;
}

interface HeadingFrame {
  level: number;
  text: string;
  /** The Status this heading denotes when it's a status section, else null. */
  status: Status | null;
}

/** Index where the body starts, skipping a leading YAML frontmatter block. */
function bodyStartLine(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return i + 1;
  }
  return 0; // unterminated fence — treat the whole file as body
}

/**
 * What a file's records were derived WITH, beyond its text: the status labels
 * decide which headings are status sections. Two snapshots built under different
 * keys disagree for reasons that have nothing to do with an edit — so the index
 * re-derives when this changes, and the heal rule never diffs across it. The
 * labels are fixed now, so this only moves when a MarkTodo version changes them.
 */
export const INDEX_FORMAT_KEY: string = STATUS_ORDER.map((st) => STATUS_LABELS[st]).join("\u0000");

/** Parse a file's text into TodoRecords with project/subproject context. */
export function indexFileTodos(
  file: string,
  text: string,
  opts: IndexFileOptions,
): TodoRecord[] {
  const isProject = opts.projectName !== null;
  const lines = text.split(/\r?\n/);
  const start = bodyStartLine(lines);
  const stack: HeadingFrame[] = [];
  const records: TodoRecord[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    const hm = HEADING_RE.exec(line);
    if (hm) {
      const level = hm[1].length;
      const headingText = hm[2].trim();
      const status = isProject ? statusFromLabel(headingText) : null;
      // Pop siblings/deeper headings so the stack is this heading's ancestor path.
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: headingText, status });
      continue;
    }

    const todo = parseTodoLine(line);
    if (!todo) continue;

    // Walk ancestors once: nearest non-status heading = subproject; nearest status
    // heading = section. (A todo can have both, e.g. `## Kitchen` › `### Progress`.)
    let subproject: string | null = null;
    let section: Status | null = null;
    for (let s = stack.length - 1; s >= 0; s--) {
      const frame = stack[s];
      if (section === null && frame.status !== null) section = frame.status;
      if (subproject === null && frame.status === null) subproject = frame.text;
      if (section !== null && subproject !== null) break;
    }

    records.push({
      ...todo,
      file,
      line: i,
      project: opts.projectName,
      subproject,
      section,
      note: noteOf(lines, i),
      projectGroup: opts.projectGroup ?? null,
      archived: opts.archived ?? false,
    });
  }

  return records;
}

/**
 * Re-label a renamed file's already-indexed records: update the path, and (when
 * the file is a project) the project name to the new basename. A pure rename
 * cannot change project-ness, so this needs no MetadataCache read — keeping the
 * project label correct the instant the rename fires, rather than waiting on the
 * eventually-consistent cache. Pure, so it's unit-
 * tested directly; the index glue just maps old path → new.
 */
export function patchRecordsForRename(
  records: readonly TodoRecord[],
  newPath: string,
  newBasename: string,
): TodoRecord[] {
  return records.map((r) => ({
    ...r,
    file: newPath,
    project: r.project === null ? null : newBasename,
  }));
}
