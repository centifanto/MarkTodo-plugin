/**
 * Pure indexing logic: turn a file's TEXT + a little config into
 * `TodoRecord[]`, attaching project/subproject context. No Obsidian, no IO — so
 * it is unit-tested directly with plain strings. The Obsidian glue (index.ts)
 * supplies the text (via cachedRead) and the config (from MetadataCache +
 * settings).
 *
 * Subproject rule: a todo's subproject is the DEEPEST ancestor heading
 * whose name is NOT a status label. In a project file the configured status
 * labels are passed in (so `### Doing` is a status section, not a subproject);
 * for ambient notes the label set is empty (every heading is a plain grouping).
 */

import {
  type Status,
  type StatusAliases,
  type TodoRecord,
  STATUS_ORDER,
  statusLabelLookup,
} from "../core/types";
import { parseTodoLine } from "../core/parse";
import { noteOf } from "../core/span";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface IndexFileOptions {
  /** Project name when the file is a project (has the frontmatter key); else null. */
  projectName: string | null;
  /**
   * Configured status labels for THIS file when it's a project; null for ambient
   * notes. A heading whose text matches a label is a status section (carrying that
   * Status); everything else is a subproject grouping. We need the full map (not
   * just a presence-set) so we can record WHICH status a section heading denotes.
   */
  statusLabels: Record<Status, string> | null;
  /** Your previous labels, still read as status sections. */
  statusAliases?: StatusAliases;
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

/** Build a lowercased-label → Status lookup, legacy `Progress` included (empty for ambient notes). */
function labelToStatus(labels: Record<Status, string> | null, aliases?: StatusAliases): Map<string, Status> {
  return labels ? statusLabelLookup(labels, aliases) : new Map<string, Status>();
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
 * What a file's records were derived WITH, beyond its text: the
 * status labels decide which headings are status sections. Two snapshots built
 * under different keys disagree for reasons that have nothing to do with an
 * edit — so the index re-derives when this changes, and the heal rule never
 * diffs across it. Normalized the way headings are matched (trimmed,
 * case-insensitive).
 */
export function indexFormatKey(statusLabels: Record<Status, string>, aliases: StatusAliases = {}): string {
  const norm = (label: string): string => label.trim().toLowerCase();
  return [
    ...STATUS_ORDER.map((st) => norm(statusLabels[st])),
    ...STATUS_ORDER.map((st) => (aliases[st] ?? []).map(norm).join("\u0001")),
  ].join("\u0000");
}

/** Parse a file's text into TodoRecords with project/subproject context. */
export function indexFileTodos(
  file: string,
  text: string,
  opts: IndexFileOptions,
): TodoRecord[] {
  const statusOfLabel = labelToStatus(opts.statusLabels, opts.statusAliases);
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
      const status = statusOfLabel.get(headingText.toLowerCase()) ?? null;
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
