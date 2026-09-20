/**
 * The todo sort registry — ONE table of every ordering any surface offers.
 * PURE: todos in, todos out; no Obsidian, no DOM.
 *
 * A registry rather than a switch, on purpose. The two older shapes in this
 * codebase (`{date, priority, …}[sort]` in `smartViews.ts`, `Record<ProjectSort,
 * …>` in `projectNav.ts`) each spread one sort across three places — the
 * comparator, the union type, and the picker's option list — so adding one meant
 * three edits and a chance to forget the third. Here a sort is ONE row: its
 * label, its comparator, and the surfaces that offer it. Adding a sort is adding
 * a row, and both the picker and the sorter pick it up.
 *
 * Shared with the companion app, which orders the same lists from the same
 * table, so "sorted by Priority" can't come to mean two different orders.
 */
import { PRIORITY_ORDER, type TodoRecord } from "../core/types";
import { formatTitle } from "./format";

/** One collator, not one per comparison — see the note in `projectNav.ts`. */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

/**
 * What a comparator needs that the todos don't carry.
 *
 * `dateOf` exists because "the date" is surface-dependent: a list orders on the
 * due date, while each Today segment has its OWN date (due, the reminder, the
 * completion day), so one date comparator serves both.
 */
export interface SortContext {
  dateOf: (todo: TodoRecord) => string | null;
  /** Recent reads newest first; every other surface soonest first. */
  newestFirst: boolean;
}

export type TodoCompare = (a: TodoRecord, b: TodoRecord, ctx: SortContext) => number;

/** Which surfaces offer a sort: the status-sectioned lists, the Today segments. */
export type SortSurface = "list" | "today";

export interface SortDef {
  label: string;
  /** null = leave the todos in the order they arrived, i.e. file order. */
  compare: TodoCompare | null;
  on: readonly SortSurface[];
  /** Offered only where more than one project is on screen. */
  crossProject?: boolean;
}

const rank = <K,>(order: readonly K[], k: K): number => {
  const i = order.indexOf(k);
  return i === -1 ? order.length : i;
};

// Undated last, whichever direction the dates run.
const byDate: TodoCompare = (a, b, ctx) => {
  const da = ctx.dateOf(a);
  const db = ctx.dateOf(b);
  if (da === db) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return ctx.newestFirst ? db.localeCompare(da) : da.localeCompare(db);
};

const byPriority: TodoCompare = (a, b) =>
  rank(PRIORITY_ORDER, a.priority) - rank(PRIORITY_ORDER, b.priority);

const byProject: TodoCompare = (a, b) => (a.project ?? "").localeCompare(b.project ?? "");

const byTitle: TodoCompare = (a, b) =>
  COLLATOR.compare(formatTitle(a.displayText), formatTitle(b.displayText));

/**
 * Every sort, in the order a picker lists them. THE table: to add a sort, add a
 * row here — nothing else in either program needs to change.
 *
 * `due` and `date` share a comparator but not a meaning, so they stay two rows:
 * on a list the ordering date is always the due date, while on Today it is
 * whichever date that segment is about.
 */
export const TODO_SORTS = {
  manual: { label: "Manual", compare: null, on: ["list"] },
  due: { label: "Due", compare: byDate, on: ["list"] },
  date: { label: "Date", compare: byDate, on: ["today"] },
  priority: { label: "Priority", compare: byPriority, on: ["list", "today"] },
  title: { label: "Title", compare: byTitle, on: ["list", "today"] },
  project: { label: "Project", compare: byProject, on: ["list", "today"], crossProject: true },
} as const satisfies Record<string, SortDef>;

export type SortKey = keyof typeof TODO_SORTS;

/** File order, and the only sort that leaves drag-reorder meaningful. */
export const DEFAULT_LIST_SORT: SortKey = "manual";
export const DEFAULT_TODAY_SORT: SortKey = "date";

/**
 * The options a surface offers, in table order. `spansProjects` drops the
 * Project sort on a single project's list, where it would order nothing.
 */
export function sortOptions(
  surface: SortSurface,
  spansProjects: boolean,
): ReadonlyArray<{ key: SortKey; label: string }> {
  return (Object.entries(TODO_SORTS) as Array<[SortKey, SortDef]>)
    .filter(([, def]) => def.on.includes(surface) && (spansProjects || def.crossProject !== true))
    .map(([key, def]) => ({ key, label: def.label }));
}

/** Every row as a plain record — the `as const` above narrows `on` past `includes`. */
const DEFS: Readonly<Record<string, SortDef>> = TODO_SORTS;

/** A stored sort, with anything this surface can't offer replaced by `fallback`. */
export function parseSort(raw: unknown, surface: SortSurface, fallback: SortKey): SortKey {
  return typeof raw === "string" && DEFS[raw]?.on.includes(surface) === true
    ? (raw as SortKey)
    : fallback;
}

/** Does this sort leave file order intact (so dragging to reorder still means something)? */
export function isManualSort(key: SortKey): boolean {
  return TODO_SORTS[key].compare === null;
}

/**
 * `todos` in `key` order, as a new array.
 *
 * The tie-break chain always ends in file order, so a list never reshuffles
 * itself between two renders of the same data (the app breaks on `sort_order`,
 * its stored equivalent). The manual sort is the chain with no primary: the
 * todos arrive in file order and stay in it.
 */
export function sortTodos(
  todos: readonly TodoRecord[],
  key: SortKey,
  ctx: SortContext,
): TodoRecord[] {
  const primary = TODO_SORTS[key].compare;
  if (primary === null) return [...todos];
  return [...todos].sort(
    (a, b) =>
      primary(a, b, ctx) ||
      byDate(a, b, ctx) ||
      byPriority(a, b, ctx) ||
      byProject(a, b, ctx) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}
