/**
 * PURE view-data builders shared by every todo surface (List, Kanban, Inbox,
 * Agenda). Turns a filtered `TodoRecord[]` into List groups or Board columns.
 * No Obsidian/IO.
 */
import {
  type Phase,
  type Status,
  type TodoRecord,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_PHASE,
  statusOf,
} from "../core/types";
import { groupTodos } from "../core/query";
import { doneAtOf } from "../core/dates";
import { type Card, type Column } from "../ui/boardTypes";
import { DEFAULT_FOCUS, type Focus, inFocus } from "../ui/focus";
import { DEFAULT_LIST_SORT, sortTodos, type SortKey } from "../ui/sorts";

export interface LabeledGroup {
  label: string;
  todos: TodoRecord[];
  /** Set when the group IS a note (group by note) — the view links the heading to it. */
  file?: string;
  /** Set when the group IS a status (group by status) — its "+" adds a todo with it. */
  status?: Status;
  /** The status's phase, so the list can head each run of sections with it. */
  phase?: Phase;
}

export type ListGroupBy = "status" | "subproject" | "note";

/**
 * List groups: by status (status labels, STATUS_ORDER), by subproject, or by
 * source note (loose todos are "where did I write this?"). Note groups
 * are labeled with the vault path minus `.md` and sorted by it, todos keeping
 * their file order.
 */
export function buildListGroups(todos: TodoRecord[], groupBy: ListGroupBy): LabeledGroup[] {
  if (groupBy === "note") {
    const byFile = new Map<string, TodoRecord[]>();
    for (const t of todos) {
      const bucket = byFile.get(t.file);
      if (bucket) bucket.push(t);
      else byFile.set(t.file, [t]);
    }
    return [...byFile.entries()]
      .map(([file, items]) => ({
        label: file.replace(/\.md$/i, ""),
        file,
        todos: [...items].sort((a, b) => a.line - b.line),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  if (groupBy === "subproject") {
    return [...groupTodos(todos, "subproject").entries()].map(([label, items]) => ({
      label,
      todos: items,
    }));
  }
  return [...groupTodos(todos, "status").entries()].map(([st, items]) => ({
    label: STATUS_LABELS[st as Status],
    status: st as Status,
    phase: STATUS_PHASE[st as Status],
    todos: items,
  }));
}

/**
 * List sections for Todos and a project: every status the `focus` shows, in
 * column order, empty ones included, as in the app. An empty section is still
 * where its "+" lives, and headings that are always there are something you
 * learn to scan; ones that come and go are not.
 *
 * Focus narrows WHICH sections exist, never what a section contains — so a
 * focused list is the same list with whole sections lifted out, and the counts
 * on the sections that remain are unchanged.
 *
 * `sort` orders WITHIN each status, never across them: the status sections are
 * the list's structure, and a sort that could move a todo out of its own
 * section would be a regrouping wearing a sort's name. The default leaves every
 * todo in the order it arrived — file order from the index — which is the only
 * ordering that dragging a row can write back to the note.
 *
 * DONE is the exception, and takes no sort at all: finished work is read newest
 * first or it is not read. A todo carrying no `done @` stamp (hand-typed `[x]`
 * the writer hasn't synced yet) sorts to the bottom, where an undated todo goes
 * on every other surface.
 */
/**
 * Finished work, most recently completed first, by the `done @` stamp the
 * writer keeps in step with the glyph (`core/dates.ts`). Not a sort the user
 * picks: every other order over Done answers a question nobody asks.
 *
 * The stamp carries a minute, so a day's completions order within the day; one
 * written before stamps had a time reads as that day's 00:00.
 */
export function newestDoneFirst(todos: readonly TodoRecord[]): TodoRecord[] {
  return sortTodos(todos, "date", { dateOf: doneAtOf, newestFirst: true });
}

export function buildStatusSections(
  todos: readonly TodoRecord[],
  focus: Focus = DEFAULT_FOCUS,
  sort: SortKey = DEFAULT_LIST_SORT,
): LabeledGroup[] {
  const byStatus = new Map<Status, TodoRecord[]>(STATUS_ORDER.map((st) => [st, []]));
  for (const todo of todos) byStatus.get(statusOf(todo))?.push(todo);
  const ctx = { dateOf: (t: TodoRecord) => t.due, newestFirst: false };
  return STATUS_ORDER.filter((st) => inFocus(focus, st)).map((st) => ({
    label: STATUS_LABELS[st],
    status: st,
    phase: STATUS_PHASE[st],
    todos: st === "DONE" ? newestDoneFirst(byStatus.get(st) ?? []) : sortTodos(byStatus.get(st) ?? [], sort, ctx),
  }));
}

/**
 * Board columns in column order, including empty columns.
 *
 * Hard model: a kanban is a WORKING surface, so untriaged todos
 * (project === null — loose todos) never appear on any board; they are
 * triaged from the MarkTodo Inbox view. Enforced here so every board inherits
 * the rule.
 */
export function buildColumns(todos: TodoRecord[], focus: Focus = DEFAULT_FOCUS): Column[] {
  const byStatus = new Map<Status, Card[]>();
  for (const st of STATUS_ORDER) byStatus.set(st, []);
  for (const t of todos) {
    if (t.project === null) continue;
    const card: Card = { id: t.id ?? `${t.file}:${t.line}`, todo: t };
    byStatus.get(statusOf(t))?.push(card);
  }
  return STATUS_ORDER.filter((st) => inFocus(focus, st)).map((st) => ({
    status: st,
    label: STATUS_LABELS[st],
    phase: STATUS_PHASE[st],
    // The Done column reads newest first, like the Done section in a list; the
    // rest keep file order, which is what a drag can write back.
    cards: st === "DONE" ? doneCardsNewestFirst(byStatus.get(st) ?? []) : (byStatus.get(st) ?? []),
  }));
}

/** `newestDoneFirst` over cards, so the board's Done column matches a list's. */
function doneCardsNewestFirst(cards: readonly Card[]): Card[] {
  const order = new Map(newestDoneFirst(cards.map((c) => c.todo)).map((t, i) => [t, i]));
  return [...cards].sort((a, b) => (order.get(a.todo) ?? 0) - (order.get(b.todo) ?? 0));
}
