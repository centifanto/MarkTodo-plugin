/**
 * Where a todo lives, and what that allows (there is no special Inbox note).
 * Pure — no `obsidian` import — so the plugin's writer/menus and the companion
 * app's writer share one definition (the app copies this file verbatim).
 *
 *  - project: the file carries the project key → every status, boards, sync.
 *  - loose:   any other note → check off only (BACKLOG↔DONE); never on boards.
 *             Loose todos are what the MarkTodo Inbox view lists.
 */
import { STATUS_ORDER, type Status, type TodoRecord } from "../core/types";

export type Placement = "project" | "loose";

/** Classify a todo by whether its note is a project. */
export function placementOf(todo: Pick<TodoRecord, "project">): Placement {
  return todo.project !== null ? "project" : "loose";
}

const LOOSE_STATUSES: readonly Status[] = ["BACKLOG", "DONE"];

/** Statuses a todo in this placement may be SET to. */
export function allowedStatuses(placement: Placement): readonly Status[] {
  return placement === "project" ? STATUS_ORDER : LOOSE_STATUSES;
}

/** May a todo in this placement be set to `status`? */
export function canSetStatus(placement: Placement, status: Status): boolean {
  return allowedStatuses(placement).includes(status);
}

/** User-facing reason a status change was refused (null when it's allowed). */
export function statusRefusal(placement: Placement, status: Status): string | null {
  if (canSetStatus(placement, status)) return null;
  return "Loose todos can only be checked off — move the todo to a project for other statuses.";
}
