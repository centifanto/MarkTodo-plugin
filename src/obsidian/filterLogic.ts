/**
 * Pure filter-bar logic (no `obsidian` import, so it's unit-testable). The bar
 * UI lives in `filterBar.ts`; this module owns what the options ARE per view
 * surface, how a persisted selection is reconciled against them, how a typed
 * query matches them, and how the single-select state becomes a `QueryScope`.
 */
import { type Priority, type TodoRecord } from "../core/types";
import { filterTodos, type QueryScope } from "../core/query";

export interface FilterState {
  project?: string;
  /** A note group (`marktodo-group`) — narrows to every project in it. */
  group?: string;
  tag?: string;
  priority?: Priority;
  managed?: boolean;
  /** Archived notes are hidden everywhere unless this is on. */
  showArchived?: boolean;
}

/**
 * Which todos a view works on:
 *  - "projects": List and Kanban — project todos only; the project picker lists projects.
 *  - "loose":    the Inbox view — non-project todos; no project picker.
 *  - "any":      Today — project AND loose todos; the project picker lists projects.
 */
export type FilterSurface = "projects" | "loose" | "any";

/** A picker option: the stored value and what the user sees. */
export type FilterOption = readonly [value: string, display: string];

/** Translate the single-select bar state into a (pure) QueryScope. */
export function filterStateToScope(s: FilterState, surface: FilterSurface = "any"): QueryScope {
  return {
    projects: s.project ? [s.project] : undefined,
    groups: s.group ? [s.group] : undefined,
    noProject: surface === "loose" ? true : undefined,
    tags: s.tag ? [s.tag] : undefined,
    priority: s.priority ? [s.priority] : undefined,
    managed: s.managed,
    includeArchived: s.showArchived === true ? true : undefined,
  };
}

/** Apply the bar state to todos, within the surface's todo set. */
export function filterByState(
  todos: readonly TodoRecord[],
  s: FilterState,
  surface: FilterSurface,
): TodoRecord[] {
  const scoped = filterTodos([...todos], filterStateToScope(s, surface));
  return surface === "projects" ? scoped.filter((t) => t.project !== null) : scoped;
}

/** How many filters are set (the collapsed bar's badge). */
export function activeFilterCount(s: FilterState): number {
  // `showArchived` is a visibility toggle, not a narrowing filter — it widens
  // what you see, so counting it in the badge would read backwards.
  return [s.project, s.group, s.tag, s.priority, s.managed].filter((v) => v !== undefined)
    .length;
}

/** True if any filter is set (drives the empty-state copy + clear affordance). */
export function isFilterActive(s: FilterState): boolean {
  return activeFilterCount(s) > 0;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function projectNames(todos: readonly TodoRecord[]): string[] {
  return distinct(todos.map((t) => t.project).filter((p): p is string => p !== null));
}

/** Project picker options: the projects (none on the loose/Inbox surface). */
export function projectOptions(
  todos: readonly TodoRecord[],
  surface: FilterSurface,
): FilterOption[] {
  if (surface === "loose") return [];
  return projectNames(todos).map((p) => [p, p] as const);
}

/** Group picker options: the distinct `marktodo-group` values in view. */
export function groupOptions(todos: readonly TodoRecord[]): FilterOption[] {
  return distinct(
    todos.map((t) => t.projectGroup).filter((g): g is string => g !== null),
  ).map((g) => [g, g] as const);
}

/** Tag picker options (display with the leading `#`). */
export function tagOptions(todos: readonly TodoRecord[]): FilterOption[] {
  return distinct(todos.flatMap((t) => t.tags)).map((t) => [t, "#" + t] as const);
}

/**
 * Drop selections this surface can no longer show — a renamed/removed project,
 * a vanished tag, or a project on the loose surface (including the retired
 * "::inbox::" sentinel restored from memory) — so an impossible filter
 * never silently hides everything. Mutates `state`; returns true if anything
 * was dropped.
 */
export function reconcileFilterState(
  state: FilterState,
  todos: readonly TodoRecord[],
  surface: FilterSurface,
): boolean {
  let changed = false;
  if (
    state.project !== undefined &&
    !projectOptions(todos, surface).some(([v]) => v === state.project)
  ) {
    state.project = undefined;
    changed = true;
  }
  if (
    state.group !== undefined &&
    !groupOptions(todos).some(([v]) => v === state.group)
  ) {
    state.group = undefined;
    changed = true;
  }
  if (state.tag !== undefined && !tagOptions(todos).some(([v]) => v === state.tag)) {
    state.tag = undefined;
    changed = true;
  }
  return changed;
}

/**
 * Options matching a typed query, case-insensitively on the display text:
 * prefix matches first, then substring matches, each keeping option order. An
 * empty query returns every option.
 */
export function matchOptions(
  options: readonly FilterOption[],
  query: string,
): FilterOption[] {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return [...options];
  const bare = (display: string): string => display.toLowerCase().replace(/^#/, "");
  const prefix = options.filter(([, d]) => bare(d).startsWith(q));
  const inner = options.filter(([, d]) => !bare(d).startsWith(q) && bare(d).includes(q));
  return [...prefix, ...inner];
}

/**
 * Stable signature of the DYNAMIC option sets (projects + tags). Views rebuild
 * the bar only when this changes, so an unrelated index update doesn't tear down
 * an open picker — while a renamed/added project still triggers a rebuild so
 * the options stay fresh.
 */
export function filterOptionsSignature(todos: readonly TodoRecord[]): string {
  const tags = distinct(todos.flatMap((t) => t.tags));
  const groups = groupOptions(todos).map(([v]) => v);
  // Newlines can't occur in a basename, a tag or a group, so they separate
  // without collision.
  return (
    projectNames(todos).join("\n") + " " + tags.join("\n") + " " + groups.join("\n")
  );
}
