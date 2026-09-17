/**
 * A small yes/no dialog (e.g. deleting a todo). Obsidian has no
 * built-in confirm for plugins; this keeps destructive actions one extra,
 * explicit click away.
 */
import { type App, type ButtonComponent, Modal, Setting, requireApiVersion } from "obsidian";
import { THEME_CLASS } from "./themeStyles";

/**
 * The red button of a destructive action. Obsidian 1.13 deprecated `setWarning()`
 * and made it call `setDestructive().setCta()`; older versions only have the
 * `mod-warning` class it used to add.
 */
export function markDestructive(button: ButtonComponent): ButtonComponent {
  if (requireApiVersion("1.13.0")) return button.setDestructive().setCta();
  button.buttonEl.addClass("mod-warning");
  return button;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Optional lines shown as a list under the message (e.g. the notes affected). */
  details?: string[];
  confirmText: string;
  /** A second way to go ahead, shown between Cancel and the confirm button. */
  alternative?: { text: string; onChoose: () => void };
  /** Red confirm button (default) for destructive actions; false = the accent button. */
  destructive?: boolean;
  onConfirm: () => void;
  /** Runs when the dialog closes without confirming (Cancel, Esc, the ×). */
  onCancel?: () => void;
}

export function confirmAction(app: App, opts: ConfirmOptions): void {
  new ConfirmModal(app, opts).open();
}

class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private opts: ConfirmOptions,
  ) {
    super(app);
    this.modalEl.addClass(THEME_CLASS);
  }

  onOpen(): void {
    this.setTitle(this.opts.title);
    this.contentEl.createEl("p", { text: this.opts.message });
    if (this.opts.details && this.opts.details.length > 0) {
      const list = this.contentEl.createEl("ul");
      for (const line of this.opts.details) list.createEl("li", { text: line });
    }
    const buttons = new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
    const { alternative } = this.opts;
    if (alternative) {
      buttons.addButton((b) =>
        b.setButtonText(alternative.text).onClick(() => {
          this.confirmed = true;
          this.close();
          alternative.onChoose();
        }),
      );
    }
    buttons.addButton((b) => {
      b.setButtonText(this.opts.confirmText).onClick(() => {
        this.confirmed = true;
        this.close();
        this.opts.onConfirm();
      });
      if (this.opts.destructive === false) b.setCta();
      else markDestructive(b);
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.confirmed) this.opts.onCancel?.();
  }
}
