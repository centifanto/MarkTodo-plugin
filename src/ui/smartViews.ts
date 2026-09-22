/**
 * The Agenda view's four segments and their arrangement.
 * PURE: todos in, sections out — no Obsidian, no DOM.
 *
 * Ported from the companion app's same view: same windows, same ordering,
 * same group titles, so it means the same thing on both screens; the plugin
 * filters an in-memory `TodoRecord[]`.
 *
 * Each segment has its OWN date — due for Agenda/Upcoming, the reminder for
 * Reminders — so "sort by date" means the
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
import { notifyAtOf } from "../core/dates";
import { addDays, friendlyDate } from "./dates";
import { DEFAULT_AGENDA_SORT, parseSort, sortOptions, sortTodos, type SortKey } from "./sorts";

/** One collator, not one per comparison — see the note in `projectNav.ts`. */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export type SmartViewType = "agenda" | "upcoming" | "reminders";

export const SMART_VIEWS: ReadonlyArray<{ key: SmartViewType; label: string }> = [
  { key: "agenda", label: "Agenda" },
  { key: "upcoming", label: "Upcoming" },
  { key: "reminders", label: "Reminders" },
];

/** How long "Upcoming" looks ahead. */
export const SMART_WINDOW_DAYS = 7;

export const EMPTY_MESSAGES: Record<SmartViewType, string> = {
  agenda: "Nothing due or overdue. Give a todo a due date, or write due @ 2026-09-30 in the note.",
  upcoming: "Nothing overdue, due today, or due in the next 7 days.",
  reminders:
    "No reminders set. Add notify @ 2026-09-30 09:00 to a todo — the MarkTodo app notifies you at that time.",
};

/** Agenda's sorts come from the one registry (`sorts.ts`), like every other list's. */
export type AgendaSort = SortKey;
export type AgendaGroup = "none" | "date" | "project" | "priority" | "status";

export interface AgendaArrangement {
  sort: AgendaSort;
  group: AgendaGroup;
}

export const DEFAULT_AGENDA_ARRANGEMENT: AgendaArrangement = {
  sort: DEFAULT_AGENDA_SORT,
  group: "none",
};

/**
 * Each segment's OWN default arrangement, because they are three different
 * questions.
 *
 * Agenda leads with status dividers: it is the "what am I on" screen, and a
 * flat run of rows makes you read every glyph to find the two you are actually
 * working on. The other two default to no grouping — Upcoming and Reminders
 * are about dates, and a status divider over a date question is noise.
 *
 * A default, not a rule: the header's sort-and-group menu overrides it per
 * segment and remembers what you chose.
 */
export const DEFAULT_ARRANGEMENTS: Record<SmartViewType, AgendaArrangement> = {
  agenda: { sort: DEFAULT_AGENDA_SORT, group: "status" },
  upcoming: { ...DEFAULT_AGENDA_ARRANGEMENT },
  reminders: { ...DEFAULT_AGENDA_ARRANGEMENT },
};

/** A fresh per-segment arrangement map (the settings default, and the migration's base). */
export function defaultArrangements(): Record<SmartViewType, AgendaArrangement> {
  return {
    agenda: { ...DEFAULT_ARRANGEMENTS.agenda },
    upcoming: { ...DEFAULT_ARRANGEMENTS.upcoming },
    reminders: { ...DEFAULT_ARRANGEMENTS.reminders },
  };
}

// Agenda always spans projects, so the Project sort is always on offer here.
export const AGENDA_SORTS = sortOptions("agenda", true);

export const AGENDA_GROUPS: ReadonlyArray<{ key: AgendaGroup; label: string }> = [
  { key: "none", label: "None" },
  { key: "date", label: "Date" },
  { key: "project", label: "Project" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
];

/** A stored Agenda sort, with anything Agenda can't offer replaced by the default. */
export function parseAgendaSort(value: unknown): AgendaSort {
  return parseSort(value, "agenda", DEFAULT_AGENDA_SORT);
}

export function isAgendaGroup(value: unknown): value is AgendaGroup {
  return AGENDA_GROUPS.some((g) => g.key === value);
}

export interface AgendaSection {
  key: string;
  title: string;
  todos: TodoRecord[];
  /** Set when the section IS a status (group by status) — the list folds those. */
  status?: Status;
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
    default:
      return todo.due;
  }
}

/**
 * Which todos a segment shows. Archived notes are excluded here rather than in
 * the caller — Agenda is a "what needs me" surface, and archiving is how you say
 * a project no longer does.
 *
 * Loose todos are INCLUDED: a todo written into a daily note is still due today.
 * That is the one place Agenda differs from Kanban, which is project-only by
 * construction.
 */
export function smartViewTodos(
  todos: readonly TodoRecord[],
  view: SmartViewType,
  today: string,
): TodoRecord[] {
  const live = todos.filter((t) => !t.archived);
  switch (view) {
    case "agenda":
      return live.filter((t) => statusOf(t) !== "DONE" && t.due !== null && t.due <= today);
    case "upcoming": {
      // Agenda's todos too, as in the app: Upcoming is today through a week out —
      // and everything already OVERDUE, which the band at the top separates out.
      // There is no lower bound on purpose: a todo you have already missed is the
      // most upcoming thing you have, and hiding it here made it invisible on the
      // one screen you check when planning the week.
      const horizon = addDays(today, SMART_WINDOW_DAYS);
      return live.filter((t) => statusOf(t) !== "DONE" && t.due !== null && t.due <= horizon);
    }
    case "reminders":
      return live.filter((t) => statusOf(t) !== "DONE" && notifyAtOf(t) !== null);
  }
}

/**
 * The overdue band's section key. Stable and shared, so both renderers can style
 * it as a small divider rather than dress it up as an ordinary group header —
 * and so neither has to match on the word "Overdue".
 */
export const OVERDUE_KEY = "overdue";

/**
 * Split a due-dated set into what is already late and everything else, each
 * keeping the order it arrived in.
 *
 * Strictly `due < today`: a todo due TODAY is not overdue, it is today's. That
 * is the same line `projectNav.projectCounts` draws for its red badge, and the
 * two must agree or the navigator and the list would disagree about the same
 * todo.
 */
export function splitOverdue(
  todos: readonly TodoRecord[],
  today: string,
): { overdue: TodoRecord[]; rest: TodoRecord[] } {
  const overdue: TodoRecord[] = [];
  const rest: TodoRecord[] = [];
  for (const todo of todos) {
    if (todo.due !== null && todo.due < today) overdue.push(todo);
    else rest.push(todo);
  }
  return { overdue, rest };
}

/** Sort and (optionally) group a segment's todos into rendered sections. */
export function arrangeSmartTodos(
  todos: readonly TodoRecord[],
  view: SmartViewType,
  { sort, group }: AgendaArrangement,
  ctx: ArrangeContext,
): AgendaSection[] {
  const rank = <K,>(order: readonly K[], k: K) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  const statusRank = (s: Status) => rank(STATUS_ORDER, s);
  // Every segment reads soonest first, undated last.
  const sortCtx = { dateOf: (t: TodoRecord) => smartDateOf(t, view), newestFirst: false };
  const sorted = sortTodos(todos, sort, sortCtx);

  // Overdue comes out FIRST, before any grouping, on the two segments that are
  // about what is due. It is not a group — it is the thing the screen is for —
  // so it survives whatever sort or grouping is in effect rather than existing
  // only under "group by date". Reminders is untouched: a reminder that has
  // passed is still just a reminder.
  const banded = view === "agenda" || view === "upcoming";
  const { overdue, rest } = banded
    ? splitOverdue(sorted, ctx.today)
    : { overdue: [] as TodoRecord[], rest: sorted };
  const band: AgendaSection[] =
    overdue.length === 0 ? [] : [{ key: OVERDUE_KEY, title: "Overdue", todos: overdue }];

  if (group === "none") {
    return rest.length === 0 ? band : [...band, { key: "all", title: "", todos: rest }];
  }

  // Section order: `bucket` first (numeric), then `sub` — a date (ascending) or
  // a project name.
  interface Group {
    key: string;
    title: string;
    bucket: number;
    sub: string;
    status?: Status;
  }
  const loose = "No project";
  const groupOf = (todo: TodoRecord): Group => {
    switch (group) {
      case "date": {
        const d = smartDateOf(todo, view)?.slice(0, 10) ?? null;
        if (d === null) return { key: "none", title: "No date", bucket: 2, sub: "" };
        // Only Reminders reaches this: a reminder whose time has passed still
        // groups as overdue. Agenda and Upcoming had theirs lifted into the band
        // above before any of this ran, so `rest` holds nothing older than today.
        // Deliberately NOT `OVERDUE_KEY`: that key means the band, and a passed
        // reminder is an ordinary bucket — pulling it forward would re-date the
        // todo, which is not what a missed reminder asks for.
        if (d < ctx.today)
          return { key: "date-overdue", title: "Overdue", bucket: 0, sub: "" };
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
          status,
        };
      }
    }
  };

  const sections = new Map<string, AgendaSection & Group>();
  for (const todo of rest) {
    const g = groupOf(todo);
    const section = sections.get(g.key) ?? { ...g, todos: [] };
    section.todos.push(todo);
    sections.set(g.key, section);
  }
  // Date sections read soonest first; every other grouping is alphabetical.
  const compareSub = (a: string, b: string) =>
    group === "date" ? a.localeCompare(b) : COLLATOR.compare(a, b);
  return [
    ...band,
    ...[...sections.values()]
      .sort((a, b) => a.bucket - b.bucket || compareSub(a.sub, b.sub))
      .map(({ key, title, todos: data, status }) => ({ key, title, todos: data, status })),
  ];
}

/**
 * Every segment's size in ONE pass. The Agenda tabs and the navigator's Agenda
 * row both want counts, and three `smartViewTodos` calls means three walks of
 * the whole vault — one of them running a regex per todo. This walks once.
 */
export function smartViewCounts(
  todos: readonly TodoRecord[],
  today: string,
): Record<SmartViewType, number> {
  const horizon = addDays(today, SMART_WINDOW_DAYS);
  const counts: Record<SmartViewType, number> = { agenda: 0, upcoming: 0, reminders: 0 };
  for (const todo of todos) {
    if (todo.archived) continue;
    if (statusOf(todo) === "DONE") continue;
    if (todo.due !== null) {
      if (todo.due <= today) counts.agenda += 1;
      // No lower bound, matching `smartViewTodos`: the tab's number has to be
      // what the tab draws, overdue band included, or it reads as a lie.
      if (todo.due <= horizon) counts.upcoming += 1;
    }
    if (notifyAtOf(todo) !== null) counts.reminders += 1;
  }
  return counts;
}
