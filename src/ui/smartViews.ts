/**
 * The Today view's four segments and their arrangement.
 * PURE: todos in, sections out — no Obsidian, no DOM.
 *
 * Ported from the companion app's Today view: same windows, same ordering,
 * same group titles, so Today means the same thing on both screens; the plugin
 * filters an in-memory `TodoRecord[]`.
 *
 * Each segment has its OWN date — due for Today/Upcoming, the reminder for
 * Reminders, the completion day for Recent — so "sort by date" means the
 * obvious thing wherever you are.
 */
import {
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  statusOf,
  type Priority,
  type Status,
  type TodoRecord,
} from "../core/types";
import { doneDateOf, notifyAtOf } from "../core/dates";
import { addDays, friendlyDate } from "./dates";
import { formatTitle } from "./format";

/** One collator, not one per comparison — see the note in `projectNav.ts`. */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export type SmartViewType = "today" | "upcoming" | "reminders" | "recent";

export const SMART_VIEWS: ReadonlyArray<{ key: SmartViewType; label: string }> = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "reminders", label: "Reminders" },
  { key: "recent", label: "Recent" },
];

/** How long "Upcoming" looks ahead and "Recent" looks back. */
export const SMART_WINDOW_DAYS = 7;

export const EMPTY_MESSAGES: Record<SmartViewType, string> = {
  today: "Nothing due today or overdue. Give a todo a due date, or write due @ 2026-09-30 in the note.",
  upcoming: "Nothing due today or in the next 7 days.",
  reminders:
    "No reminders set. Add notify @ 2026-09-30 09:00 to a todo — the MarkTodo app notifies you at that time.",
  recent: "Nothing completed in the last 7 days.",
};

export type TodaySort = "date" | "priority" | "project" | "title";
export type TodayGroup = "none" | "date" | "project" | "priority" | "status";

export interface TodayArrangement {
  sort: TodaySort;
  group: TodayGroup;
}

export const DEFAULT_TODAY_ARRANGEMENT: TodayArrangement = { sort: "date", group: "none" };

export const TODAY_SORTS: ReadonlyArray<{ key: TodaySort; label: string }> = [
  { key: "date", label: "Date" },
  { key: "priority", label: "Priority" },
  { key: "project", label: "Project" },
  { key: "title", label: "Title" },
];

export const TODAY_GROUPS: ReadonlyArray<{ key: TodayGroup; label: string }> = [
  { key: "none", label: "None" },
  { key: "date", label: "Date" },
  { key: "project", label: "Project" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
];

export function isTodaySort(value: unknown): value is TodaySort {
  return TODAY_SORTS.some((s) => s.key === value);
}

export function isTodayGroup(value: unknown): value is TodayGroup {
  return TODAY_GROUPS.some((g) => g.key === value);
}

export interface TodaySection {
  key: string;
  title: string;
  todos: TodoRecord[];
}

export interface ArrangeContext {
  today: string;
  priorityLabels: Record<Priority, string>;
}

/** The segment's own date for a todo (reminders keep their time, for ordering). */
export function smartDateOf(todo: TodoRecord, view: SmartViewType): string | null {
  switch (view) {
    case "reminders":
      return notifyAtOf(todo);
    case "recent":
      return doneDateOf(todo);
    default:
      return todo.due;
  }
}

/**
 * Which todos a segment shows. Archived notes are excluded here rather than in
 * the caller — Today is a "what needs me" surface, and archiving is how you say
 * a project no longer does.
 *
 * Loose todos are INCLUDED: a todo written into a daily note is still due today.
 * That is the one place Today differs from Kanban, which is project-only by
 * construction.
 */
export function smartViewTodos(
  todos: readonly TodoRecord[],
  view: SmartViewType,
  today: string,
): TodoRecord[] {
  const live = todos.filter((t) => !t.archived);
  switch (view) {
    case "today":
      return live.filter((t) => statusOf(t) !== "DONE" && t.due !== null && t.due <= today);
    case "upcoming": {
      // Today's todos too, as in the app: Upcoming is today through a week out.
      const horizon = addDays(today, SMART_WINDOW_DAYS);
      return live.filter(
        (t) => statusOf(t) !== "DONE" && t.due !== null && t.due >= today && t.due <= horizon,
      );
    }
    case "reminders":
      return live.filter((t) => statusOf(t) !== "DONE" && notifyAtOf(t) !== null);
    case "recent": {
      const since = addDays(today, -SMART_WINDOW_DAYS);
      return live.filter((t) => {
        const done = doneDateOf(t);
        return statusOf(t) === "DONE" && done !== null && done >= since;
      });
    }
  }
}

/** Sort and (optionally) group a segment's todos into rendered sections. */
export function arrangeSmartTodos(
  todos: readonly TodoRecord[],
  view: SmartViewType,
  { sort, group }: TodayArrangement,
  ctx: ArrangeContext,
): TodaySection[] {
  const rank = <K,>(order: readonly K[], k: K) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  const statusRank = (s: Status) => rank(STATUS_ORDER, s);
  // Recent reads newest first; every other segment soonest first. Undated last.
  const newestFirst = view === "recent";
  const byDate = (a: TodoRecord, b: TodoRecord) => {
    const da = smartDateOf(a, view);
    const db = smartDateOf(b, view);
    if (da === db) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return newestFirst ? db.localeCompare(da) : da.localeCompare(db);
  };
  const byPriority = (a: TodoRecord, b: TodoRecord) =>
    rank(PRIORITY_ORDER, a.priority) - rank(PRIORITY_ORDER, b.priority);
  const byProject = (a: TodoRecord, b: TodoRecord) =>
    (a.project ?? "").localeCompare(b.project ?? "");
  const byTitle = (a: TodoRecord, b: TodoRecord) =>
    COLLATOR.compare(formatTitle(a.displayText), formatTitle(b.displayText));
  const primary = { date: byDate, priority: byPriority, project: byProject, title: byTitle }[sort];
  // The tie-break chain ends in file order, so the list never reshuffles itself
  // between renders (the app breaks on `sort_order`, its stored equivalent).
  const sorted = [...todos].sort(
    (a, b) =>
      primary(a, b) ||
      byDate(a, b) ||
      byPriority(a, b) ||
      byProject(a, b) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );

  if (group === "none") {
    return sorted.length === 0 ? [] : [{ key: "all", title: "", todos: sorted }];
  }

  // Section order: `bucket` first (numeric), then `sub` — a date (ascending, or
  // descending for Recent) or a project name.
  interface Group {
    key: string;
    title: string;
    bucket: number;
    sub: string;
  }
  const loose = "No project";
  const groupOf = (todo: TodoRecord): Group => {
    switch (group) {
      case "date": {
        const d = smartDateOf(todo, view)?.slice(0, 10) ?? null;
        if (d === null) return { key: "none", title: "No date", bucket: 2, sub: "" };
        if (view !== "recent" && d < ctx.today)
          return { key: "overdue", title: "Overdue", bucket: 0, sub: "" };
        return { key: d, title: friendlyDate(d, ctx.today), bucket: 1, sub: d };
      }
      case "project": {
        const name = todo.project ?? loose;
        // Loose todos last: they are the ones still to be filed.
        return { key: `p:${name}`, title: name, bucket: todo.project === null ? 1 : 0, sub: name };
      }
      case "priority":
        return {
          key: todo.priority,
          title: ctx.priorityLabels[todo.priority],
          bucket: rank(PRIORITY_ORDER, todo.priority),
          sub: "",
        };
      case "status": {
        const status = statusOf(todo);
        return {
          key: status,
          title: STATUS_LABELS[status],
          bucket: statusRank(status),
          sub: "",
        };
      }
    }
  };

  const sections = new Map<string, TodaySection & Group>();
  for (const todo of sorted) {
    const g = groupOf(todo);
    const section = sections.get(g.key) ?? { ...g, todos: [] };
    section.todos.push(todo);
    sections.set(g.key, section);
  }
  const compareSub = (a: string, b: string) =>
    group === "date"
      ? newestFirst
        ? b.localeCompare(a)
        : a.localeCompare(b)
      : COLLATOR.compare(a, b);
  return [...sections.values()]
    .sort((a, b) => a.bucket - b.bucket || compareSub(a.sub, b.sub))
    .map(({ key, title, todos: data }) => ({ key, title, todos: data }));
}

/**
 * Every segment's size in ONE pass. The Today tabs and the navigator's Today
 * row both want counts, and four `smartViewTodos` calls means four walks of the
 * whole vault — two of them running a regex per todo. This walks once.
 */
export function smartViewCounts(
  todos: readonly TodoRecord[],
  today: string,
): Record<SmartViewType, number> {
  const horizon = addDays(today, SMART_WINDOW_DAYS);
  const since = addDays(today, -SMART_WINDOW_DAYS);
  const counts: Record<SmartViewType, number> = { today: 0, upcoming: 0, reminders: 0, recent: 0 };
  for (const todo of todos) {
    if (todo.archived) continue;
    const done = statusOf(todo) === "DONE";
    if (done) {
      const doneDate = doneDateOf(todo);
      if (doneDate !== null && doneDate >= since) counts.recent += 1;
      continue;
    }
    if (todo.due !== null) {
      if (todo.due <= today) counts.today += 1;
      if (todo.due >= today && todo.due <= horizon) counts.upcoming += 1;
    }
    if (notifyAtOf(todo) !== null) counts.reminders += 1;
  }
  return counts;
}
