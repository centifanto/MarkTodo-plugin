/**
 * Fuzzy picker for the "Move to project" action — lists the
 * vault's MarkTodo project files; on choose, the caller moves the todo there.
 */
import { type App, FuzzySuggestModal, type TFile } from "obsidian";
import { THEME_CLASS } from "./themeStyles";

export class MoveToProjectModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.modalEl.addClass(THEME_CLASS);
    this.setPlaceholder("Move todo to project…");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.basename;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
