/**
 * Pure indexing logic: turn a file's TEXT + a little config into
 * `TodoRecord[]`, attaching project/status context. No Obsidian, no IO — so
 * it is unit-tested directly with plain strings. The Obsidian glue (index.ts)
 * supplies the text (via cachedRead) and the config (from MetadataCache +
 * settings).
 *
 * Only status headings attach workflow context; other headings are ordinary Markdown.
 */

import { type Status, type TodoRecord, STATUS_BY_LABEL, statusFromLabel } from "../core/types";
import { parseTodoLine } from "../core/parse";
import { noteOf, todoHierarchy } from "../core/span";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface IndexFileOptions {
  /**
   * Project name when the file is a project (has the frontmatter key); else null.
   * It also decides whether headings CAN be status sections: in a project a
   * heading matching a status label carries that Status, in an ambient note every
   * heading is ordinary Markdown.
   */
  projectName: string | null;
  /** The note's `marktodo-group` — file-level context, like `projectName`. */
  projectGroup?: string | null;
  /** The note's `marktodo-archived`. */
  archived?: boolean;
}

interface HeadingFrame {
  level: number;
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
 * What a file's records were derived WITH, beyond its text: `STATUS_BY_LABEL`,
 * the heading-text → Status table `statusFromLabel` consults, is the whole of
 * it. Two snapshots built under different keys disagree for reasons that have
 * nothing to do with an edit — so the index re-derives when this changes, and
 * the heal rule never diffs across it. The labels are fixed now, so this only
 * moves when a MarkTodo version renames one or adds a legacy alias.
 *
 * Sorted on purpose, so the key is the table's CONTENT and not its iteration
 * order: `STATUS_ORDER` decides columns and display, never what a heading
 * means, and reordering it must not churn this.
 */
export const INDEX_FORMAT_KEY: string = [...STATUS_BY_LABEL]
  .map(([label, status]) => `${label}=${status}`)
  .sort()
  .join("\u0000");

/** Parse a file's text into TodoRecords with project/status context. */
export function indexFileTodos(
  file: string,
  text: string,
  opts: IndexFileOptions,
): TodoRecord[] {
  const isProject = opts.projectName !== null;
  const lines = text.split(/\r?\n/);
  const start = bodyStartLine(lines);
  const hierarchy = todoHierarchy(lines);
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
      stack.push({ level, status });
      continue;
    }

    const todo = parseTodoLine(line);
    if (!todo) continue;

    let section: Status | null = null;
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].status !== null) { section = stack[s].status; break; }
    }
    const ancestry = hierarchy.get(i)!;
    records.push({
      ...todo,
      ...ancestry,
      // Step text stays verbatim; tokens carry no scheduling or priority meaning.
      ...(ancestry.parentLine !== null ? { priority: "NONE" as const, due: null, tags: [], links: [] } : {}),
      steps: [],
      file,
      line: i,
      project: opts.projectName,
      section,
      note: noteOf(lines, i),
      projectGroup: opts.projectGroup ?? null,
      archived: opts.archived ?? false,
    });
  }

  const byLine = new Map(records.map((r) => [r.line, r]));
  for (const record of records) {
    let parent = record.parentLine === null ? undefined : byLine.get(record.parentLine);
    while (parent) {
      parent.steps.push({ line: record.line, text: record.displayText, done: record.glyph === "x" });
      parent = parent.parentLine === null ? undefined : byLine.get(parent.parentLine);
    }
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
