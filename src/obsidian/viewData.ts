/**
 * PURE view-data builders shared by every todo surface (List, Kanban, Inbox,
 * Today). Turns a filtered `TodoRecord[]` into List groups or Board columns.
 * No Obsidian/IO.
 */
import { type Status, type TodoRecord, STATUS_LABELS, STATUS_ORDER, statusOf } from "../core/types";
import { groupTodos } from "../core/query";
import { type Card, type Column } from "../ui/boardTypes";

export interface LabeledGroup {
  label: string;
  todos: TodoRecord[];
  /** Set when the group IS a note (group by note) — the view links the heading to it. */
  file?: string;
  /** Set when the group IS a status (group by status) — its "+" adds a todo with it. */
  status?: Status;
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
    todos: items,
  }));
}

/**
 * List sections for Todos and a project: EVERY status, in column order,
 * empty ones included, as in the app. An empty
 * section is still where its "+" lives, and six headings that are always there
 * are something you learn to scan; ones that come and go are not. Each todo keeps
 * the order it arrives in (file order from the index).
 */
export function buildStatusSections(todos: readonly TodoRecord[]): LabeledGroup[] {
  const byStatus = new Map<Status, TodoRecord[]>(STATUS_ORDER.map((st) => [st, []]));
  for (const todo of todos) byStatus.get(statusOf(todo))?.push(todo);
  return STATUS_ORDER.map((st) => ({ label: STATUS_LABELS[st], status: st, todos: byStatus.get(st) ?? [] }));
}

/**
 * Board columns in column order, including empty columns.
 *
 * Hard model: a kanban is a WORKING surface, so untriaged todos
 * (project === null — loose todos) never appear on any board; they are
 * triaged from the MarkTodo Inbox view. Enforced here so every board inherits
 * the rule.
 */
export function buildColumns(todos: TodoRecord[]): Column[] {
  const byStatus = new Map<Status, Card[]>();
  for (const st of STATUS_ORDER) byStatus.set(st, []);
  for (const t of todos) {
    if (t.project === null) continue;
    const card: Card = { id: t.id ?? `${t.file}:${t.line}`, todo: t };
    byStatus.get(statusOf(t))?.push(card);
  }
  return STATUS_ORDER.map((st) => ({
    status: st,
    label: STATUS_LABELS[st],
    cards: byStatus.get(st) ?? [],
  }));
}
