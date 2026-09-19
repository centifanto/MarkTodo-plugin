/**
 * MarkTodo core types — the FROZEN CONTRACT.
 *
 * This file is pure data + lookup tables + tiny derivations. It has ZERO
 * dependency on Obsidian, the DOM, or Svelte, so the
 * companion React Native app can reuse it verbatim.
 *
 * Every other core module (parse, serialize, status, query) imports from here.
 * Do not add runtime behavior (state machine, filtering) to this file — that
 * lives in status.ts / query.ts.
 */

// ────────────────────────────────────────────────────────────────────────────
// Status — canonical value is the checkbox GLYPH
// ────────────────────────────────────────────────────────────────────────────

export type Status =
  | "BACKLOG"
  | "WARMING"
  | "PROGRESS"
  | "BLOCKED"
  | "PAUSED"
  | "DONE";

/**
 * Column / display order. Fixed — MarkTodo's own shape, not a preference.
 * It runs through the two PHASES below: the three you plan with, then the three
 * the work is actually in.
 */
export const STATUS_ORDER: readonly Status[] = [
  "BACKLOG",
  "WARMING",
  "PAUSED",
  "PROGRESS",
  "BLOCKED",
  "DONE",
];

/** Status → the single glyph char written inside `[ ]`. */
export const STATUS_GLYPH: Record<Status, string> = {
  BACKLOG: " ",
  WARMING: ">",
  PROGRESS: "/",
  BLOCKED: "!",
  PAUSED: "-",
  DONE: "x",
};

/** Glyph char → Status. Only the six known glyphs map; anything else is null. */
export const GLYPH_TO_STATUS: Readonly<Record<string, Status>> = {
  " ": "BACKLOG",
  ">": "WARMING",
  "/": "PROGRESS",
  "!": "BLOCKED",
  "-": "PAUSED",
  x: "DONE",
};

/**
 * Heading labels for status sections in project files. FIXED: these are
 * MarkTodo's status names, not a preference — the label in a note and the label
 * in the UI are always the same string, so a heading means the same thing in
 * every vault, on every device, in both programs.
 */
export const STATUS_LABELS: Record<Status, string> = {
  BACKLOG: "Backlog",
  WARMING: "Warming",
  PROGRESS: "Doing",
  BLOCKED: "Blocked",
  PAUSED: "Paused",
  DONE: "Done",
};

/**
 * Labels a status went by before MarkTodo renamed it (Progress → Doing). A note
 * heading still on one counts as that status's section, and MarkTodo renames the
 * heading the next time it places a todo in that note.
 */
export const LEGACY_STATUS_LABELS: Readonly<Partial<Record<Status, readonly string[]>>> = {
  PROGRESS: ["Progress"],
};

/**
 * Heading text (trimmed, lowercased) → the Status it denotes: the labels first,
 * then the legacy ones, which never override a current label.
 */
export const STATUS_BY_LABEL: ReadonlyMap<string, Status> = (() => {
  const map = new Map<string, Status>();
  for (const st of STATUS_ORDER) map.set(STATUS_LABELS[st].toLowerCase(), st);
  for (const st of STATUS_ORDER) {
    for (const alias of LEGACY_STATUS_LABELS[st] ?? []) {
      const key = alias.toLowerCase();
      if (!map.has(key)) map.set(key, st);
    }
  }
  return map;
})();

/** The Status a heading denotes (legacy labels included), or null when it denotes none. */
export function statusFromLabel(text: string): Status | null {
  return STATUS_BY_LABEL.get(text.trim().toLowerCase()) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase — the two halves of STATUS_ORDER
// ────────────────────────────────────────────────────────────────────────────

/**
 * A status belongs to one of two phases:
 *  - PLAN:   work you have decided on but are not doing — Backlog, Warming, Paused.
 *  - ACTIVE: work that is underway or finished — Doing, Blocked, Done.
 *
 * Phase is DERIVED from status, never stored: nothing about it reaches a note.
 * It exists so a list can say which half of the board you are looking at, and so
 * "show me only what's live" is one control instead of three checkboxes.
 */
export type Phase = "PLAN" | "ACTIVE";

export const PHASE_ORDER: readonly Phase[] = ["PLAN", "ACTIVE"];

export const PHASE_LABELS: Record<Phase, string> = {
  PLAN: "Plan",
  ACTIVE: "Active",
};

/** Status → its phase. The split follows STATUS_ORDER: the first three, then the rest. */
export const STATUS_PHASE: Record<Status, Phase> = {
  BACKLOG: "PLAN",
  WARMING: "PLAN",
  PAUSED: "PLAN",
  PROGRESS: "ACTIVE",
  BLOCKED: "ACTIVE",
  DONE: "ACTIVE",
};

/** The statuses in a phase, in STATUS_ORDER. */
export function statusesInPhase(phase: Phase): Status[] {
  return STATUS_ORDER.filter((s) => STATUS_PHASE[s] === phase);
}

// ────────────────────────────────────────────────────────────────────────────
// Priority — an inline `@<token>` in the todo text (see
// priority.ts); legacy lines carry it in the capsule as `p=<token>`.
// ────────────────────────────────────────────────────────────────────────────

export type Priority = "URGENT" | "HIGH" | "LOW" | "NONE";

export const PRIORITY_ORDER: readonly Priority[] = [
  "URGENT",
  "HIGH",
  "LOW",
  "NONE",
];

/** Priority → token word (`@urgent` inline; legacy `p=urgent`). NONE writes nothing. */
export const PRIORITY_TOKEN: Record<Exclude<Priority, "NONE">, string> = {
  URGENT: "urgent",
  HIGH: "high",
  LOW: "low",
};

/** Legacy capsule `p=` value → Priority. Unknown values fall back to NONE. */
export const TOKEN_TO_PRIORITY: Readonly<Record<string, Priority>> = {
  urgent: "URGENT",
  high: "HIGH",
  low: "LOW",
};

// ────────────────────────────────────────────────────────────────────────────
// Todo — the intrinsic model of a single `- [ ] ...` line (in-place model)
// ────────────────────────────────────────────────────────────────────────────

/**
 * A parsed todo line. This is the LINE'S intrinsic data only — location (file,
 * line number) and file-context (project, subproject) are attached by the index
 * layer as a `TodoRecord`, never here, to keep core pure.
 *
 * In-place model: the parser extracts ONLY the trailing `mt`
 * capsule. `displayText` retains links/tags/dates exactly where the user typed
 * them; `due`/`tags`/`links` below are *recognized by scanning* for indexing,
 * NOT removed from `displayText`. This is what makes serialization
 * identity-preserving.
 */
export interface Todo {
  /** 8-char id when managed; `null` when the line carries no `mt` capsule. */
  id: string | null;

  /**
   * The literal status glyph char. Source of truth for serialization. Usually
   * one of `STATUS_GLYPH` values, but any char (e.g. `?`) is preserved verbatim
   * so we never corrupt a non-MarkTodo checkbox.
   */
  glyph: string;

  /**
   * From the first inline priority token (`@high`, alias `@ph`), else a legacy
   * capsule `p=`; `NONE` when absent. (Recognized in place.)
   */
  priority: Priority;

  /**
   * The line after the checkbox, minus the capsule, right-trimmed. Links/tags/
   * dates stay INLINE here (in-place model).
   */
  displayText: string;

  /** Leading whitespace before the bullet, preserved for round-trip. */
  indent: string;

  /** The list bullet char (`-`, `*`, or `+`), preserved for round-trip. */
  bullet: string;

  /** `YYYY-MM-DD` if a `due @ ...` token is present in the text, else null. (Recognized in place.) */
  due: string | null;

  /** `#tag` occurrences (without the leading `#`), for filtering. (Recognized in place.) */
  tags: string[];

  /** `[[wikilink]]` targets, for filtering. (Recognized in place.) */
  links: string[];

  /**
   * Capsule `key=value` tokens we don't recognize, preserved verbatim for
   * forward-compatibility (unknown keys never break parsing).
   */
  extraTokens: string[];
}

/**
 * A `Todo` plus the location/context the index attaches. The views and the
 * query layer operate on these.
 */
export interface TodoRecord extends Todo {
  /** Vault-relative file path. */
  file: string;
  /** 0-based line index within the file. */
  line: number;
  /** Project name (e.g. file basename) when the file has the marktodo frontmatter key; else null. */
  project: string | null;
  /** Nearest non-status ancestor heading (subproject), else null. */
  subproject: string | null;
  /**
   * The status of the nearest ANCESTOR status-section heading the todo sits under
   * (e.g. `### Progress` → PROGRESS), or null when it isn't under one. This is the
   * "materialized view" side of the status (the glyph is canonical); the index
   * tracks it so the heal rule can detect a manual move between sections.
   * Only meaningful in project files; null in ambient notes.
   */
  section: Status | null;
  /**
   * The todo's note: the indented non-todo lines
   * directly under it, dedented and joined with `\n`. `""` when it has none.
   *
   * Derived from the file's bytes on every index — never cached in the line, so
   * a note typed by hand in a note editor is picked up like any other edit.
   */
  note: string;
  /** The note's `marktodo-group`; null when ungrouped. File-level, like `project`. */
  projectGroup: string | null;
  /** The note's `marktodo-archived`. Archived todos stay indexed but drop out of views. */
  archived: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Tiny derivations (no behavior — see status.ts / query.ts for logic)
// ────────────────────────────────────────────────────────────────────────────

/** Map a glyph char to a known Status, or null if it isn't one of the six. */
export function statusFromGlyph(glyph: string): Status | null {
  return GLYPH_TO_STATUS[glyph] ?? null;
}

/** A todo's Status, defaulting unknown glyphs to BACKLOG for classification. */
export function statusOf(todo: Todo): Status {
  return statusFromGlyph(todo.glyph) ?? "BACKLOG";
}

/** A todo is "managed" iff it carries an id (i.e. has an `mt` capsule). */
export function isManaged(todo: Todo): boolean {
  return todo.id !== null;
}
