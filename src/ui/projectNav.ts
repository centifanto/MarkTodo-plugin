/**
 * Navigator list logic: how the projects in the MarkTodo
 * pane are sorted, pinned, sectioned by group and collapsed — plus the per-
 * project counts the rows show. PURE (no Obsidian, no DOM), so it's unit-tested
 * directly.
 *
 * Ported from the companion app, which got here first: same function names,
 * same ordering, same collapse semantics, so the two navigators can't drift
 * into two behaviors. The plugin's row shape is its own (a `TFile`-derived
 * record), so every function is generic over the minimal shape it actually
 * reads.
 */
import { isManaged, statusOf, type TodoRecord } from "../core/types";

/**
 * ONE collator for every name comparison here. `String.localeCompare` with an
 * options object builds a fresh `Intl.Collator` per call, which is the single
 * most expensive thing in this file — sorting a few hundred projects was ~3.9ms
 * that way and ~0.4ms through a cached collator.
 */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export type ProjectSort = "name" | "open" | "recent";

export const DEFAULT_PROJECT_SORT: ProjectSort = "name";

export const PROJECT_SORTS: ReadonlyArray<{ key: ProjectSort; label: string }> = [
  { key: "name", label: "Name" },
  { key: "open", label: "Open todos" },
  { key: "recent", label: "Recently edited" },
];

export function isProjectSort(value: unknown): value is ProjectSort {
  return PROJECT_SORTS.some((s) => s.key === value);
}

/** Open / overdue counts for one project. */
export interface ProjectCounts {
  open: number;
  overdue: number;
}

/** A project row in the navigator. */
export interface NavProject extends ProjectCounts {
  /** Display name — the file basename. */
  name: string;
  /** Vault path — what a row opens, and what a frontmatter write addresses. */
  path: string;
  /** `marktodo-group`, or null when ungrouped. */
  group: string | null;
  archived: boolean;
  /** `marktodo-pinned` — read off the note, so a rename carries the pin along. */
  pinned: boolean;
  /** `TFile.stat.mtime` — the "recent" sort. */
  mtime: number;
}

type Sortable = Pick<NavProject, "name" | "path" | "mtime" | "open">;

/** Sort by the chosen key, name as the tie-break (so the list is never unstable). */
export function sortProjects<P extends Sortable>(projects: readonly P[], sort: ProjectSort): P[] {
  const byName = (a: P, b: P) => COLLATOR.compare(a.name, b.name);
  const primary: Record<ProjectSort, (a: P, b: P) => number> = {
    name: () => 0,
    open: (a, b) => b.open - a.open,
    recent: (a, b) => b.mtime - a.mtime,
  };
  return [...projects].sort((a, b) => primary[sort](a, b) || byName(a, b));
}

type Pinnable = Sortable & Pick<NavProject, "pinned">;

/**
 * Split into the pinned section and the rest, both in `sort` order. The pin is
 * the note's OWN flag, not a list of paths kept beside the vault: renaming a
 * pinned note keeps its pin, and both programs see the same pins because they
 * read them from the same Markdown.
 */
export function arrangeProjects<P extends Pinnable>(
  projects: readonly P[],
  sort: ProjectSort,
): { pinned: P[]; rest: P[] } {
  const sorted = sortProjects(projects, sort);
  return {
    pinned: sorted.filter((p) => p.pinned),
    rest: sorted.filter((p) => !p.pinned),
  };
}

type Groupable = Sortable & Pick<NavProject, "group" | "archived">;

/**
 * A rendered section. `key` is stable for collapse memory: the group's own name,
 * or one of the two sentinels below — a group can't be named with them, since
 * `readNoteMeta` trims and a group is a plain frontmatter scalar, so a literal
 * `\u0000`-prefixed value can't be typed by accident.
 */
export interface ProjectSection<P> {
  key: string;
  /** Header text; null for the ungrouped run, which renders with no header. */
  label: string | null;
  projects: P[];
  /** Archived sections start collapsed and sit last. */
  archived: boolean;
}

export const UNGROUPED_KEY = "\u0000ungrouped";
export const ARCHIVED_KEY = "\u0000archived";

/**
 * The list below the Pinned section: one collapsible section per group (name-
 * ordered), then ungrouped projects under no header, then a single "Archived"
 * section last.
 *
 * Archived projects are pulled out of their groups deliberately — an archived
 * project under "Work" would still be sitting in the list you scan every day,
 * which is the thing archiving is meant to stop. Pins are honored for archived
 * projects too: a pinned archived project stays in the Pinned section, the only
 * way to keep one to hand without unarchiving it.
 */
export function sectionProjects<P extends Groupable>(
  projects: readonly P[],
  sort: ProjectSort,
): ProjectSection<P>[] {
  const sorted = sortProjects(projects, sort);
  const live = sorted.filter((p) => !p.archived);
  const archived = sorted.filter((p) => p.archived);

  const byGroup = new Map<string, P[]>();
  const ungrouped: P[] = [];
  for (const project of live) {
    const group = project.group;
    if (group === null || group === "") {
      ungrouped.push(project);
      continue;
    }
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(project);
    else byGroup.set(group, [project]);
  }

  const sections: ProjectSection<P>[] = [];
  for (const group of [...byGroup.keys()].sort((a, b) =>
    COLLATOR.compare(a, b),
  )) {
    sections.push({ key: group, label: group, projects: byGroup.get(group)!, archived: false });
  }
  if (ungrouped.length > 0) {
    sections.push({ key: UNGROUPED_KEY, label: null, projects: ungrouped, archived: false });
  }
  if (archived.length > 0) {
    sections.push({ key: ARCHIVED_KEY, label: "Archived", projects: archived, archived: true });
  }
  return sections;
}

/**
 * Whether a section renders open. Groups default open; Archived defaults closed
 * (it should be there without being in the way). `collapsed` holds the
 * keys toggled AWAY from their default, so a newly created group never inherits
 * a stale collapse from a group that once had its name.
 */
export function isSectionOpen(
  section: ProjectSection<unknown>,
  collapsed: readonly string[],
): boolean {
  const toggled = collapsed.includes(section.key);
  return section.archived ? toggled : !toggled;
}

/** Flip one section's collapse state. */
export function toggleSection(collapsed: readonly string[], key: string): string[] {
  return collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key];
}

/**
 * Every group currently in use, name-ordered and de-duplicated case-insensitively
 * (first spelling seen wins, so a picker never offers "Work" and "work" as two
 * rows). Groups are derived from the notes — there is no registry.
 */
export function existingGroups(projects: readonly { group: string | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const project of projects) {
    const group = project.group?.trim();
    if (!group) continue;
    const key = group.toLowerCase();
    if (!seen.has(key)) seen.set(key, group);
  }
  return [...seen.values()].sort((a, b) => COLLATOR.compare(a, b));
}

/** One note's new `marktodo-group` (null = remove the key). */
export interface GroupEdit {
  path: string;
  group: string | null;
}

/**
 * The frontmatter writes that edit a group. Groups have no registry
 * — a group IS the notes that carry its name — so creating, renaming,
 * re-membering and deleting one are all the same operation: set or clear the
 * key on the notes whose membership changes, and touch nothing else.
 *
 *  - `from` the group being edited (null when creating one).
 *  - `to` its name after the edit (trimmed); null deletes it — every member
 *    becomes ungrouped. The projects themselves are never touched otherwise.
 *  - `members` the project paths that should be in it afterwards.
 *
 * Renaming onto the name of another existing group merges the two, which is
 * what "these belong together" means when the name is the group.
 */
export function groupEdits(
  projects: readonly { path: string; group: string | null }[],
  from: string | null,
  to: string | null,
  members: ReadonlySet<string>,
): GroupEdit[] {
  const name = to?.trim() || null;
  const edits: GroupEdit[] = [];
  for (const project of projects) {
    const inOld = from !== null && project.group === from;
    if (name === null) {
      if (inOld) edits.push({ path: project.path, group: null });
      continue;
    }
    if (members.has(project.path)) {
      if (project.group !== name) edits.push({ path: project.path, group: name });
    } else if (inOld) {
      edits.push({ path: project.path, group: null });
    }
  }
  return edits;
}

/** Carry a group's collapse state across a rename (dropped when it is deleted). */
export function renameSectionKey(collapsed: readonly string[], from: string, to: string | null): string[] {
  const rest = collapsed.filter((k) => k !== from);
  return collapsed.includes(from) && to !== null && !rest.includes(to) ? [...rest, to] : rest;
}

/**
 * Open + overdue counts per project name, from the live index.
 *
 * "Open" is every todo that isn't DONE — including BLOCKED and PAUSED, which are
 * still yours to deal with. Overdue is a strict `due < today`: a todo due today
 * belongs in Today, not in a red badge. `today` is passed in (an ISO date) rather
 * than read from the clock, so this stays pure and testable.
 */
export function projectCounts(
  todos: readonly TodoRecord[],
  today: string,
): Map<string, ProjectCounts> {
  const out = new Map<string, ProjectCounts>();
  for (const todo of todos) {
    if (todo.project === null) continue;
    if (statusOf(todo) === "DONE") continue;
    const counts = out.get(todo.project) ?? { open: 0, overdue: 0 };
    counts.open += 1;
    if (todo.due !== null && todo.due < today) counts.overdue += 1;
    out.set(todo.project, counts);
  }
  return out;
}

/** Open todos with no project: what the Inbox row counts. */
export function looseOpenCount(todos: readonly TodoRecord[], includeUnmanaged: boolean): number {
  return todos.filter(
    (t) =>
      t.project === null &&
      statusOf(t) !== "DONE" &&
      (includeUnmanaged || isManaged(t)),
  ).length;
}
