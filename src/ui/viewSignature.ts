/**
 * Render signatures. PURE.
 *
 * Every todo view subscribes to the index, and the index notifies on any file
 * change anywhere in the vault. Most of those change nothing a given view
 * draws — you typed a word in a note, or a todo moved in a project this view
 * filters out — but each notification still tore the view down and rebuilt it,
 * Svelte components and all. With the navigator now permanently open in the
 * sidebar, that cost was being paid constantly.
 *
 * A signature is a cheap string of exactly what a view would draw. Same string
 * as last time = nothing to do. It is the view-level twin of the index's own
 * content hash, which already stops an unchanged FILE from being re-indexed.
 *
 * JSON rather than a joined string on purpose: `displayText` is arbitrary user
 * text, and a separator that can appear in the data makes two different lists
 * hash the same — the one failure mode that would show up as a view silently
 * refusing to update.
 */
import { type TodoRecord } from "../core/types";

/** The fields of a todo that change what a row LOOKS like. */
function todoFields(todo: TodoRecord): unknown[] {
  // file+line: position (reveal target, and reorder within a group).
  // id: managed vs unmanaged, which changes the row's affordances.
  // glyph: status. displayText: title, priority and due tokens. note: preview.
  return [todo.file, todo.line, todo.id, todo.glyph, todo.displayText, todo.note];
}

/** A signature for a flat list of todos. */
export function todosSignature(todos: readonly TodoRecord[]): string {
  return JSON.stringify(todos.map(todoFields));
}

/** A signature for labelled groups of todos (List, Inbox, Agenda, board columns). */
export function groupsSignature(
  groups: ReadonlyArray<{ label: string; todos: readonly TodoRecord[] }>,
): string {
  return JSON.stringify(groups.map((g) => [g.label, g.todos.map(todoFields)]));
}
