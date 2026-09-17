/**
 * Lightweight mode's Obsidian side (decisions in `deviceModeLogic.ts`).
 *
 * - The choice lives in Obsidian's local storage — per vault, per device — so a
 *   phone's choice never reaches the computer through data.json.
 * - `AppOfferModal` is the one-time popup (and what every dashboard entry point
 *   shows in Lightweight mode): the MarkTodo app on Google Play, or the full
 *   plugin on this device. iPhone and iPad users get a note on why the app is
 *   Android-only.
 * - `LightweightView` stands in for every MarkTodo view type in Lightweight mode,
 *   so a workspace saved with a MarkTodo tab shows the same message instead of
 *   "plugin not active".
 */
import { type App, ItemView, Modal, Notice, Platform, type WorkspaceLeaf } from "obsidian";
import { DEVICE_MODE_KEY, PLAY_STORE_URL, parseDeviceMode, type DeviceMode } from "./deviceModeLogic";
import { THEME_CLASS } from "./themeStyles";
import { LOGO_ICON } from "../ui/logo";
import type MarkTodoPlugin from "../../main";

export function storedDeviceMode(app: App): DeviceMode | null {
  return parseDeviceMode(app.loadLocalStorage(DEVICE_MODE_KEY));
}

/**
 * Record this device's choice. A change of mode takes effect the next time
 * Obsidian starts — Lightweight never built the index or the views to switch to.
 */
export function chooseDeviceMode(plugin: MarkTodoPlugin, mode: DeviceMode): void {
  plugin.app.saveLocalStorage(DEVICE_MODE_KEY, mode);
  const running: DeviceMode = plugin.lightweight ? "light" : "full";
  if (mode !== running) {
    new Notice(
      mode === "full"
        ? "MarkTodo: restart Obsidian to load the full plugin on this device."
        : "MarkTodo: restart Obsidian to switch this device to Lightweight mode.",
      8000,
    );
  }
}

/** Open the MarkTodo app's Play Store listing (the system hands it to the store app). */
export function openPlayStore(): void {
  window.open(PLAY_STORE_URL);
}

/** The app offer itself, shared by the popup and the stand-in view. */
function renderAppOffer(el: HTMLElement, plugin: MarkTodoPlugin, onChoose: () => void): void {
  el.addClass("marktodo-app-offer");
  el.createEl("p", {
    text:
      "The MarkTodo app for Android works on the same notes as this plugin, and it's made for a phone, " +
      "without Obsidian's overhead.",
  });
  el.createEl("p", {
    text: plugin.lightweight
      ? "On this device the plugin runs in Lightweight mode. Your notes keep MarkTodo's checkboxes and the " +
        "todo trigger, and archived projects are still filed, but the dashboard and boards are off so " +
        "Obsidian stays quick."
      : "This device runs the full plugin. You can switch it to Lightweight mode in MarkTodo's settings.",
  });

  const buttons = el.createDiv({ cls: "marktodo-app-offer-buttons" });
  const getApp = buttons.createEl("button", { cls: "mod-cta", text: "Get the app on Google Play" });
  getApp.addEventListener("click", () => {
    if (storedDeviceMode(plugin.app) === null) chooseDeviceMode(plugin, "light");
    openPlayStore();
    onChoose();
  });
  if (plugin.lightweight) {
    const full = buttons.createEl("button", { text: "Use the full plugin on this device" });
    full.addEventListener("click", () => {
      chooseDeviceMode(plugin, "full");
      onChoose();
    });
  }

  if (Platform.isIosApp) {
    el.createEl("p", {
      cls: "marktodo-app-offer-ios",
      text:
        "On iPhone or iPad? The MarkTodo app is Android-only for now. Apple charges $99 every year to be on " +
        "their App Store along with mandatory Apple equipment I do not have to sign and submit packages. If " +
        "enough iPhone users support it, an iOS version could follow. Until then, as a solo dev I am just " +
        "losing money.",
    });
  }
}

/**
 * The app popup. `firstRun`: the one-time offer on a device nobody has chosen
 * for yet — closing it without choosing keeps Lightweight mode and records that,
 * so it is never shown again on its own.
 */
export class AppOfferModal extends Modal {
  private chose = false;

  constructor(
    private plugin: MarkTodoPlugin,
    private firstRun: boolean,
  ) {
    super(plugin.app);
    this.modalEl.addClass(THEME_CLASS);
  }

  onOpen(): void {
    this.setTitle("MarkTodo has an app");
    renderAppOffer(this.contentEl, this.plugin, () => {
      this.chose = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.firstRun && !this.chose && storedDeviceMode(this.app) === null) {
      this.app.saveLocalStorage(DEVICE_MODE_KEY, "light");
    }
  }
}

/** Every MarkTodo view type, in Lightweight mode. */
export class LightweightView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkTodoPlugin,
    private type: string,
  ) {
    super(leaf);
    this.containerEl.addClass(THEME_CLASS);
  }

  getViewType(): string {
    return this.type;
  }

  getDisplayText(): string {
    return "MarkTodo";
  }

  getIcon(): string {
    return LOGO_ICON;
  }

  async onOpen(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.createEl("h4", { text: "MarkTodo is in Lightweight mode" });
    renderAppOffer(el.createDiv(), this.plugin, () => void this.onOpen());
  }
}
