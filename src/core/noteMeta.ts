/**
 * Note-level frontmatter. A note carries up to four
 * MarkTodo facts in its YAML frontmatter: whether it is a project, which group it
 * belongs to, whether completed todos in it are deleted, and whether it is
 * archived.
 *
 * PURE — takes the already-parsed frontmatter record (Obsidian's MetadataCache
 * supplies it in the plugin; the companion app parses its own) and
 * never touches Obsidian, the DOM, or IO. Part of the core the app copies
 * byte-identically, so both programs classify a note the same way.
 *
 * Every key is a fixed constant: `marktodo` always marks a project.
 * The `marktodo-*` keys are read on ANY note, not just projects: the mechanism
 * is per-note so a daily-note template can carry them.
 */

/** Its presence (not false, not null) makes a note a project. */
export const PROJECT_FM_KEY = "marktodo";
/** The note's project group. Scalar only — one group per project. */
export const GROUP_FM_KEY = "marktodo-group";
/** `delete` = completing a todo in this note removes it from the file. */
export const CLEANUP_FM_KEY = "marktodo-cleanup";
/** Archived notes stay indexed but drop out of pickers, boards and lists. */
export const ARCHIVED_FM_KEY = "marktodo-archived";

export type CleanupPolicy = "keep" | "delete";

export interface NoteMeta {
  /** `marktodo-group`, trimmed; null when absent, blank, or not a scalar. */
  group: string | null;
  /** `marktodo-cleanup`; `keep` unless the note explicitly says `delete`. */
  cleanup: CleanupPolicy;
  /** `marktodo-archived`, present and not false/null. */
  archived: boolean;
}

export const DEFAULT_NOTE_META: NoteMeta = {
  group: null,
  cleanup: "keep",
  archived: false,
};

/**
 * True when frontmatter designates a project: `marktodo` is present with a
 * non-false, non-null value. (In core so the companion app shares it instead
 * of keeping a hand-written mirror.)
 */
export function isProjectFrontmatter(fm: Record<string, unknown> | undefined): boolean {
  return (
    fm != null &&
    PROJECT_FM_KEY in fm &&
    fm[PROJECT_FM_KEY] !== false &&
    fm[PROJECT_FM_KEY] != null
  );
}

/** Shared "key is present and switched on" test — `true`, `1`, `"yes"`, any object. */
function flagOf(fm: Record<string, unknown>, key: string): boolean {
  if (!(key in fm)) return false;
  const v = fm[key];
  if (v === false || v == null) return false;
  // A string is the frontmatter a person actually types; treat the obvious
  // negatives as off so `marktodo-archived: false` written by hand behaves.
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t !== "" && t !== "false" && t !== "no" && t !== "off" && t !== "0";
  }
  return true;
}

/**
 * The group name, or null. Scalar strings only: a list
 * value reads as ungrouped rather than guessing which entry was meant. Numbers are
 * accepted because YAML turns `marktodo-group: 2026` into one, and a person who
 * typed it meant a group called "2026".
 */
function groupOf(fm: Record<string, unknown>): string | null {
  const v = fm[GROUP_FM_KEY];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * The cleanup policy. `delete` only when the note says so exactly — anything else,
 * including a typo, keeps. Deleting lines on a guessed value is not a trade worth
 * making (a note without the key never loses a line).
 */
function cleanupOf(fm: Record<string, unknown>): CleanupPolicy {
  const v = fm[CLEANUP_FM_KEY];
  return typeof v === "string" && v.trim().toLowerCase() === "delete" ? "delete" : "keep";
}

/** Read the note-level MarkTodo frontmatter. Absent frontmatter → all defaults. */
export function readNoteMeta(fm: Record<string, unknown> | undefined): NoteMeta {
  if (fm == null) return { ...DEFAULT_NOTE_META };
  return {
    group: groupOf(fm),
    cleanup: cleanupOf(fm),
    archived: flagOf(fm, ARCHIVED_FM_KEY),
  };
}

/**
 * Whether completing a todo in this note should remove its line.
 * Archived notes never delete, whatever the policy says — archiving exists to
 * preserve history, so it outranks cleanup.
 */
export function deletesOnComplete(meta: NoteMeta): boolean {
  return meta.cleanup === "delete" && !meta.archived;
}
