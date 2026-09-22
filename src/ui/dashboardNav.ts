/**
 * The dashboard's own state. PURE.
 *
 * A list is not a tab somewhere: it is the dashboard's SELECTION,
 * drawn in the dashboard's own list column. Two columns show the navigation and
 * the selected list side by side; one column shows one of them at a time, and
 * the list has a back button. Boards and notes still open in the main area.
 */
import { type TodoRecord } from "../core/types";
import { formatTitle } from "./format";

/** What the list column shows. */
export type Selection = { kind: "inbox" } | { kind: "agenda" } | { kind: "todos" } | { kind: "project"; path: string };

export const DEFAULT_SELECTION: Selection = { kind: "agenda" };

/** "dual": navigation and list side by side. "single": one at a time, with a back button. */
export type PaneMode = "dual" | "single";

export const PANE_MODES: ReadonlyArray<{ key: PaneMode; label: string }> = [
  { key: "dual", label: "Two columns" },
  { key: "single", label: "One column, with a back button" },
];

/**
 * Which side the navigation column sits on in two columns. One column slides
 * the list in from the other side.
 */
export type NavSide = "left" | "right";

export const NAV_SIDES: ReadonlyArray<{ key: NavSide; label: string }> = [
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

/** Which column one-column mode is showing. */
export type SingleView = "nav" | "list";

/**
 * The layout actually drawn. A phone is always one column; so is a dashboard
 * squeezed below `MIN_DUAL_WIDTH` (two columns of 200px are two useless columns).
 */
export function effectivePaneMode(setting: PaneMode, opts: { phone: boolean; width: number }): PaneMode {
  if (opts.phone) return "single";
  if (opts.width > 0 && opts.width < MIN_DUAL_WIDTH) return "single";
  return setting;
}

/** Below this, two columns are drawn as one. */
export const MIN_DUAL_WIDTH = 480;
/** The navigation column's default width in two-column mode, and its limits. */
export const NAV_COLUMN_PX = 250;
export const NAV_COLUMN_MIN = 180;
/** The list column never gets narrower than this when the divider is dragged. */
export const LIST_COLUMN_MIN = 240;

/** The navigation column width for a drag, clamped so both columns stay usable. */
export function clampNavWidth(px: number, total: number): number {
  const max = Math.max(NAV_COLUMN_MIN, total - LIST_COLUMN_MIN);
  return Math.round(Math.min(Math.max(px, NAV_COLUMN_MIN), max));
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "project" && b.kind === "project" ? a.path === b.path : true;
}

/** The navigation row a selection lights up. */
export function selectionToken(selection: Selection): string {
  return selection.kind === "project" ? `file:${selection.path}` : `view:${selection.kind}`;
}

/** A stored selection, or the default when it is missing or malformed. */
export function parseSelection(raw: unknown): Selection {
  const r = (raw ?? {}) as { kind?: unknown; path?: unknown };
  if (r.kind === "inbox" || r.kind === "agenda" || r.kind === "todos") return { kind: r.kind };
  if (r.kind === "project" && typeof r.path === "string" && r.path !== "") return { kind: "project", path: r.path };
  return DEFAULT_SELECTION;
}

/** Follow a renamed project note; drop to the default when the project is gone. */
export function followRename(selection: Selection, oldPath: string, newPath: string | null): Selection {
  if (selection.kind !== "project" || selection.path !== oldPath) return selection;
  return newPath === null ? DEFAULT_SELECTION : { kind: "project", path: newPath };
}

/**
 * The dashboard's search (in the navigation column). Every todo in the
 * vault whose visible text matches, archived notes left out like everywhere
 * else, in note order so the results group by note. Done todos are included —
 * searching is how you find the thing you already finished. An empty query has
 * no results: the list column then shows the selection again.
 */
export function searchTodos(todos: readonly TodoRecord[], query: string): TodoRecord[] {
  if (query.trim() === "") return [];
  return todos
    .filter((t) => !t.archived && todoMatchesQuery(t, query))
    .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

/**
 * The search match (Notebook Navigator's search box, for todos): every word of
 * the query must appear — in the title as shown, the note, the project, or a
 * tag. Case-insensitive; an empty query matches everything.
 */
export function todoMatchesQuery(todo: TodoRecord, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return true;
  const haystack = [formatTitle(todo.displayText), todo.note, todo.project ?? "", ...todo.tags]
    .join("\n")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}
