/**
 * "Move to project" as a plain menu at the pointer, not a dialog.
 *
 * It used to be a `FuzzySuggestModal` — the big centred command-palette window,
 * which is a lot of screen for picking one of a handful of projects. A menu
 * opens where you clicked, scrolls when a vault has many projects, and takes the
 * same keyboard navigation as every other Obsidian menu.
 *
 * The todo editor uses a dropdown instead (see `todoModal`): the project is a
 * FIELD there, sitting alongside status and due, not an action.
 */
import { Menu, type TFile } from "obsidian";
import { PROJECT_ICON } from "../ui/iconMaps";

/** Open the project picker at the pointer. `projects` should already exclude the current note. */
export function openMoveToProjectMenu(
  projects: readonly TFile[],
  event: MouseEvent,
  onChoose: (file: TFile) => void,
): void {
  const menu = new Menu();
  menu.addItem((i) => i.setTitle("Move to project").setIsLabel(true));
  for (const file of [...projects].sort((a, b) => a.basename.localeCompare(b.basename))) {
    menu.addItem((i) =>
      i
        .setTitle(file.basename)
        .setIcon(PROJECT_ICON)
        .onClick(() => onChoose(file)),
    );
  }
  menu.showAtMouseEvent(event);
}
