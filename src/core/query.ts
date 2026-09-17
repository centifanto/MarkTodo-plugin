/**
 * MarkTodo query layer — pure filter + group over TodoRecord[].
 *
 * Operates on the index-attached `TodoRecord`. Every function
 * here is PURE: it reads inputs, returns NEW arrays/Maps, and never mutates an
 * input or touches Obsidian, the DOM, or file IO. Filtering AND-combines across
 * keys; within a single list key the values OR (membership). An omitted key or
 * an empty array means "do not filter on this key".
 */

import {
  type Priority,
  type Status,
  type TodoRecord,
  STATUS_ORDER,
  isManaged,
  statusOf,
} from "./types";

/** A scope describing which todos a view should include. */
export interface QueryScope {
  tags?: string[];
  projects?: string[];
  status?: Status[];
  priority?: Priority[];
  managed?: boolean; // true = managed only, false = unmanaged only, undefined = both
  /** true = only todos OUTSIDE any project (loose todos — the Inbox view's scope). */
  noProject?: boolean;
  /** Note groups (`marktodo-group`). Membership, like `projects`. */
  groups?: string[];
  /**
   * Archived notes are EXCLUDED by default — that is the point of
   * archiving, and defaulting the other way would make every existing view show
   * them. Set true to include them ("Show archived").
   */
  includeArchived?: boolean;
}

/** Filter todos by scope: AND across keys, OR within each list; returns a new array. */
export function filterTodos(
  todos: TodoRecord[],
  scope: QueryScope,
): TodoRecord[] {
  const hasTags = scope.tags !== undefined && scope.tags.length > 0;
  const hasProjects = scope.projects !== undefined && scope.projects.length > 0;
  const hasStatus = scope.status !== undefined && scope.status.length > 0;
  const hasPriority = scope.priority !== undefined && scope.priority.length > 0;
  const hasGroups = scope.groups !== undefined && scope.groups.length > 0;

  return todos.filter((todo) => {
    if (hasTags && !todo.tags.some((tag) => scope.tags!.includes(tag))) {
      return false;
    }
    if (
      hasProjects &&
      (todo.project === null || !scope.projects!.includes(todo.project))
    ) {
      return false;
    }
    if (scope.noProject === true && todo.project !== null) {
      return false;
    }
    if (
      hasGroups &&
      (todo.projectGroup === null || !scope.groups!.includes(todo.projectGroup))
    ) {
      return false;
    }
    if (todo.archived && scope.includeArchived !== true) {
      return false;
    }
    if (hasStatus && !scope.status!.includes(statusOf(todo))) {
      return false;
    }
    if (hasPriority && !scope.priority!.includes(todo.priority)) {
      return false;
    }
    if (scope.managed !== undefined && isManaged(todo) !== scope.managed) {
      return false;
    }
    return true;
  });
}

/** Group todos into a Map by status (STATUS_ORDER order) or subproject (first-appearance, "(none)" last). */
export function groupTodos(
  todos: TodoRecord[],
  by: "status" | "subproject",
): Map<string, TodoRecord[]> {
  if (by === "status") {
    const buckets = new Map<string, TodoRecord[]>();
    for (const todo of todos) {
      const key = statusOf(todo);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(todo);
      else buckets.set(key, [todo]);
    }
    const ordered = new Map<string, TodoRecord[]>();
    for (const status of STATUS_ORDER) {
      const bucket = buckets.get(status);
      if (bucket) ordered.set(status, bucket);
    }
    return ordered;
  }

  // by === "subproject": first-appearance order, with "(none)" forced last.
  const NONE = "(none)";
  const result = new Map<string, TodoRecord[]>();
  for (const todo of todos) {
    const key = todo.subproject ?? NONE;
    const bucket = result.get(key);
    if (bucket) bucket.push(todo);
    else result.set(key, [todo]);
  }
  const none = result.get(NONE);
  if (none !== undefined && result.size > 1) {
    result.delete(NONE);
    result.set(NONE, none);
  }
  return result;
}
