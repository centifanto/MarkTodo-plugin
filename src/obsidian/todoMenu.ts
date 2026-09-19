/**
 * The shared todo action menu (set status / priority / due / convert), used by
 * the list view, the board cards, and Today. Extracted so there's one
 * definition driving the Writer.
 */
import { confirmAction } from "./confirmModal";
import { formatTitle } from "../ui/format";
import { Menu } from "obsidian";
import { openNote } from "./layout";
import { STATUS_LABELS, STATUS_ORDER, statusOf, type Priority, type TodoRecord } from "../core/types";
import { STATUS_ICONS } from "../ui/iconMaps";
import { DueModal } from "./dueModal";
import { openMoveToProjectMenu } from "./moveMenu";
import { getProjectFiles } from "./projects";
import { canSetStatus, placementOf } from "./placement";
import type MarkTodoPlugin from "../../main";

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  LOW: "Low",
  NONE: "None",
};

/** Lucide icon used for every "jump to the todo's line in its note" affordance. */
export const REVEAL_ICON = "square-arrow-out-up-right";

/**
 * Open the todo's source note and place the cursor on its line — the click-through
 * from a list/board row to "where it actually lives" in markdown. Always in the
 * main area, never the list pane beside the navigator. Tolerant of a
 * stale `todo.line`: it scrolls near the todo, and the line is only the landing point.
 */
export async function revealTodo(plugin: MarkTodoPlugin, todo: TodoRecord): Promise<void> {
  await openNote(plugin, todo.file, todo.line);
}

/** Ask, then delete the todo's line from its note. */
export function confirmDeleteTodo(plugin: MarkTodoPlugin, todo: TodoRecord, after?: () => void): void {
  confirmAction(plugin.app, {
    title: "Delete todo?",
    message: `"${formatTitle(todo.displayText) || "(untitled todo)"}" will be removed from ${todo.file}.`,
    confirmText: "Delete",
    onConfirm: () => {
      void plugin.writer.deleteTodo(todo).then((ok) => {
        if (ok) after?.();
      });
    },
  });
}

/** One item per status the todo may be set to — projects get every status, loose todos just check off. */
function addStatusItems(menu: Menu, plugin: MarkTodoPlugin, todo: TodoRecord): void {
  const { writer } = plugin;
  const placement = placementOf(todo);
  for (const st of STATUS_ORDER.filter((s) => canSetStatus(placement, s))) {
    menu.addItem((i) =>
      i
        .setTitle(STATUS_LABELS[st])
        .setIcon(STATUS_ICONS[st])
        .setChecked(statusOf(todo) === st)
        .onClick(() => void writer.setStatus(todo, st)),
    );
  }
}

/**
 * The status-only menu a managed checkbox opens in a note — replaces
 * Obsidian's native [ ]↔[x] toggle so a click can reach every status.
 */
export function openStatusMenu(plugin: MarkTodoPlugin, todo: TodoRecord, event: MouseEvent): void {
  const menu = new Menu();
  addStatusItems(menu, plugin, todo);
  menu.showAtMouseEvent(event);
}

export function openTodoMenu(
  plugin: MarkTodoPlugin,
  todo: TodoRecord,
  event: MouseEvent,
): void {
  const { writer, app } = plugin;
  const menu = new Menu();
  const projectFiles = getProjectFiles(app).filter((f) => f.path !== todo.file);
  const moveItem = (evt: MouseEvent | KeyboardEvent): void => {
    // Reopened at the same pointer, so the project list lands where the menu was.
    if (evt instanceof MouseEvent) openMoveToProjectMenu(projectFiles, evt, (file) => void writer.moveTodo(todo, file.path));
  };

  addStatusItems(menu, plugin, todo);

  menu.addSeparator();
  for (const p of ["URGENT", "HIGH", "LOW", "NONE"] as const) {
    menu.addItem((i) =>
      i
        .setTitle(`Priority: ${PRIORITY_LABEL[p]}`)
        .setChecked(todo.priority === p)
        .onClick(() => void writer.setPriority(todo, p)),
    );
  }

  menu.addSeparator();
  menu.addItem((i) =>
    i
      .setTitle("Open in note")
      .setIcon(REVEAL_ICON)
      .onClick(() => void revealTodo(plugin, todo)),
  );

  menu.addSeparator();
  menu.addItem((i) =>
    i
      .setTitle("Set due date…")
      .setIcon("calendar")
      .onClick(() => new DueModal(app, todo.due, (d) => void writer.setDue(todo, d)).open()),
  );
  if (todo.due) {
    menu.addItem((i) =>
      i.setTitle("Clear due date").onClick(() => void writer.setDue(todo, null)),
    );
  }

  if (projectFiles.length > 0) {
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Move to project…").setIcon("folder-input").onClick((evt) => moveItem(evt)),
    );
  }

  if (todo.id === null) {
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Convert to MarkTodo")
        .setIcon("badge-check")
        .onClick(() => void writer.adopt(todo)),
    );
  }

  menu.addSeparator();
  menu.addItem((i) => {
    i.setTitle("Delete todo")
      .setIcon("trash-2")
      .onClick(() => confirmDeleteTodo(plugin, todo));
    (i as unknown as { setWarning?: (w: boolean) => void }).setWarning?.(true);
  });

  menu.showAtMouseEvent(event);
}
