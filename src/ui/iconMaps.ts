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

/**
 * The Projects HEADING in the navigator — the collection, not a project.
 *
 * Stacked folders, because outline is the only channel that survives 14px in
 * `--text-muted`: `folder-closed` and `folder-kanban` share one silhouette and
 * differ only by their interior marks, which is precisely the confusion a
 * heading over a list of projects has to avoid. `folders` reads as more than
 * one at a glance and stays in the folder family, so the heading and the rows
 * under it still look related. `library` and `boxes` say collection too, but
 * they leave the family — and a group of projects already has its own glyph
 * (`folder-tree`, in `navView`), so this one only has to say "all of them".
 */
export const PROJECTS_ICON = "folders";

/** Display names for the priorities — the todo modal's chips, Agenda's headers. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  LOW: "Low",
  NONE: "None",
};
