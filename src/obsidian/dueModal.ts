import { type App, Modal, Setting } from "obsidian";
import { THEME_CLASS } from "./themeStyles";

/** Minimal date picker for setting/clearing a todo's due date. */
export class DueModal extends Modal {
  private value: string;

  constructor(
    app: App,
    current: string | null,
    private onSubmit: (date: string | null) => void,
  ) {
    super(app);
    this.modalEl.addClass(THEME_CLASS);
    this.value = current ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Set due date" });

    const input = contentEl.createEl("input", { attr: { type: "date" } });
    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Clear").onClick(() => {
          this.onSubmit(null);
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Set")
          .setCta()
          .onClick(() => {
            this.onSubmit(this.value || null);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
