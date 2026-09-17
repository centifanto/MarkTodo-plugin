/**
 * MarkTodo status/priority state machine — pure, immutable transitions.
 *
 * The checkbox GLYPH is the source of truth: setting a status
 * means writing `STATUS_GLYPH[status]` into `todo.glyph`. Every function here is
 * PURE — it returns a NEW `Todo` (shallow spread copy) and never mutates input.
 * No Obsidian, DOM, file IO, or other side effects live here.
 */

import {
  type Priority,
  type Status,
  type Todo,
  STATUS_GLYPH,
  statusOf,
} from "./types";
import { withPriority } from "./priority";

/** Set a todo's status by writing the canonical glyph; returns a new Todo. */
export function setStatus(todo: Todo, status: Status): Todo {
  return { ...todo, glyph: STATUS_GLYPH[status] };
}

/** Native Obsidian "check": mark the todo DONE (glyph `x`). */
export function checkTodo(todo: Todo): Todo {
  return setStatus(todo, "DONE");
}

/**
 * Native Obsidian "uncheck": map back to BACKLOG (glyph ` `), NOT PAUSED.
 * Deliberate: unchecking a box returns it to the backlog.
 */
export function uncheckTodo(todo: Todo): Todo {
  return setStatus(todo, "BACKLOG");
}

/** Toggle: a DONE todo unchecks to BACKLOG; any other status checks to DONE. */
export function toggleCheckbox(todo: Todo): Todo {
  return statusOf(todo) === "DONE" ? uncheckTodo(todo) : checkTodo(todo);
}

/**
 * Set a todo's priority (including `NONE`); returns a new Todo. The inline token
 * in `displayText` is edited in place so the text and field agree.
 */
export function setPriority(todo: Todo, priority: Priority): Todo {
  return { ...todo, priority, displayText: withPriority(todo.displayText, priority) };
}
