/**
 * Icon names per status / priority. Render-only.
 * Both sets are MarkTodo's own glyphs — rounded squares for status
 * (`statusGlyphs.ts`), ascending bars for priority (`priorityGlyphs.ts`) —
 * registered with `addIcon` under these ids at load.
 */
import { type Priority, type Status } from "../core/types";

export const STATUS_ICONS: Record<Status, string> = {
  BACKLOG: "marktodo-status-backlog",
  WARMING: "marktodo-status-warming",
  PROGRESS: "marktodo-status-progress",
  BLOCKED: "marktodo-status-blocked",
  PAUSED: "marktodo-status-paused",
  DONE: "marktodo-status-done",
};

export const PRIORITY_ICONS: Record<Exclude<Priority, "NONE">, string> = {
  URGENT: "marktodo-priority-urgent",
  HIGH: "marktodo-priority-high",
  LOW: "marktodo-priority-low",
};

/**
 * A project, wherever one is drawn — navigator rows, a project's tab.
 * Not a folder: a folder icon beside Obsidian's own file explorer reads as a
 * directory, which a project is not.
 */
export const PROJECT_ICON = "clipboard-list";

/** Display names for the priorities — the todo modal's chips, Today's headers. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  LOW: "Low",
  NONE: "None",
};
