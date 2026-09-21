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
 *
 * A folder holding a board, which is what a project is: a folder on disk
 * (`projectsFolder`) that opens into columns. Not plain `folder` — that one
 * sits beside Obsidian's own file explorer and reads as a directory, which is
 * why this was `clipboard-list` before. The kanban marks keep it distinct
 * there while letting the app draw the same glyph for the same thing; the app
 * had been drawing `Folder` for the project sort, and one sort key with two
 * glyphs is what a shared icon vocabulary exists to prevent.
 */
export const PROJECT_ICON = "folder-kanban";

/** Display names for the priorities — the todo modal's chips, Today's headers. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  LOW: "Low",
  NONE: "None",
};
