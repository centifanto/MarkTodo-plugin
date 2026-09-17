/**
 * MarkTodo settings tab. Self-contained `PluginSettingTab` that
 * edits the `MarkTodoSettings` defined in `./settings`. Fields that change WHAT
 * or HOW we index (status labels, excluded folders) also trigger
 * `plugin.index.rebuildAll()` after saving. The orchestrator (main.ts) wires
 * `addSettingTab`; this module only builds the UI.
 *
 * Text fields save when you LEAVE them (blur or Enter), not per keystroke:
 * data.json syncs within seconds, so a half-typed folder or label
 * would reach the app and other devices — and act there.
 */

import {
  type App,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  TFile,
  TFolder,
  type TextComponent,
  requireApiVersion,
  setIcon,
} from "obsidian";
import { chooseDeviceMode, openPlayStore, storedDeviceMode } from "./deviceMode";
import { type DeviceMode } from "./deviceModeLogic";
import { CONTACT_LINKS } from "./links";
import { reconcileArchive } from "./archiveReconcile";
import { dailyNotesEnabled } from "./dailyNote";
import { confirmAction } from "./confirmModal";
import { getProjectFiles } from "./projects";
import { labelTakenBy, nextStatusAliases, normalizeLabel, planRelabel } from "./labelMigration";
import {
  DEFAULT_MARKTODO_FOLDER,
  normalizeFolderRoot,
  parentFolder,
  perFileMoves,
  planFolderMove,
} from "./folderLogic";
import { STATUS_ORDER, DEFAULT_STATUS_LABELS, type Status } from "../core/types";
import { DEFAULT_SETTINGS } from "./settings";
import {
  ACCENTS,
  THEME_MODES,
  THEME_STYLES,
  buildTheme,
  parseObsidianAccent,
  type AccentKey,
  type ThemeMode,
  type ThemeStyle,
} from "../ui/theme";
import { DASHBOARD_LOCATIONS, type DashboardLocation } from "../ui/paneLayout";
import { NAV_SIDES, PANE_MODES, type NavSide, type PaneMode } from "../ui/dashboardNav";
import { openDashboard } from "./layout";
import type MarkTodoPlugin from "../../main";

/** Run `commit` when a text field's edit is finished — blur, or Enter in an input. */
function onCommit(input: HTMLInputElement | HTMLTextAreaElement, commit: (value: string) => void): void {
  input.addEventListener("change", () => commit(input.value));
}

/**
 * A setting row: the name and description that settings search indexes, and a
 * `render` that adds its controls. `render` may return a cleanup, which Obsidian
 * runs before it redraws the row.
 */
interface Row {
  name: string;
  desc?: string;
  visible?: () => boolean;
  render: (setting: Setting) => void | (() => void);
}

/** A heading and the rows under it. */
interface Section {
  heading: string;
  rows: Row[];
}

export class MarkTodoSettingTab extends PluginSettingTab {
  private plugin: MarkTodoPlugin;
  /**
   * Changes that rewrite or move notes (a status label, the MarkTodo folder) run
   * one at a time: each plans against the settings in effect and its writes are
   * async, so a second one started before the first finished would plan against
   * stale settings and save over it.
   */
  private migrations: Promise<void> = Promise.resolve();

  private enqueue(run: () => Promise<void>): void {
    this.migrations = this.migrations.then(run).catch(() => {
      new Notice("MarkTodo: that change didn't finish. Check the notes involved, then try again.");
    });
  }

  constructor(app: App, plugin: MarkTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Obsidian 1.13+ draws the tab from these and indexes them for settings search.
   * Each row still adds its own controls, so text fields keep saving on blur.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map(({ heading, rows }) => ({ type: "group", heading, items: rows }));
  }

  /** Obsidian before 1.13 draws the tab here instead. */
  display(): void {
    this.drawByHand();
  }

  /** The same sections as the definitions, drawn with headings and rows. */
  private drawByHand(): void {
    this.containerEl.empty();
    for (const { heading, rows } of this.sections()) {
      new Setting(this.containerEl).setName(heading).setHeading();
      for (const row of rows) {
        if (row.visible && !row.visible()) continue;
        const setting = new Setting(this.containerEl).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        row.render(setting);
      }
    }
  }

  /** Redraw after a change that reshapes the tab. */
  private redraw(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else this.drawByHand();
  }

  private sections(): Section[] {
    return [
      ...(Platform.isMobile ? [this.deviceSection()] : []),
      this.appearanceSection(),
      // The dashboard's placement means nothing without a dashboard.
      ...(this.plugin.lightweight ? [] : [this.layoutSection()]),
      this.todosSection(),
      this.statusLabelsSection(),
      this.advancedSection(),
      this.folderSection(),
      this.appNoteSection(),
      this.contactSection(),
    ];
  }

  private todosSection(): Section {
    const { settings } = this.plugin;
    return {
      heading: "Todos and projects",
      rows: [
        // Capture: where the todo editor starts, and the optional catch-all note.
        {
          name: "Capture destination",
          desc: "Where new todos from the todo editor go by default. You can pick another destination each time.",
          render: (setting) => {
            if (!dailyNotesEnabled(this.app)) {
              setting.setDesc(
                "Where new todos from the todo editor go by default. ⚠ Today's daily note needs the Daily Notes core plugin, which is off.",
              );
            }
            setting.addDropdown((dropdown) =>
              dropdown
                .addOption("project", "Project (last used)")
                .addOption("daily", "Today's daily note")
                .setValue(settings.captureDestination)
                .onChange((value) => {
                  settings.captureDestination = value === "daily" ? "daily" : "project";
                  void this.plugin.saveSettings();
                  if (value === "daily" && !dailyNotesEnabled(this.app)) {
                    new Notice("MarkTodo: enable the Daily Notes core plugin to capture to today's note.");
                  }
                }),
            );
          },
        },
        {
          name: "Show unmanaged checkboxes in the Inbox",
          desc: "List plain checkboxes from ordinary notes at the bottom of MarkTodo Inbox, each with a one-click Convert.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.inboxShowUnmanaged).onChange((value) => {
                settings.inboxShowUnmanaged = value;
                void this.plugin.saveSettings();
                this.plugin.refreshDashboards();
              }),
            );
          },
        },
        {
          name: "Catch-all note",
          desc: 'Optional. A note the trigger popup can send lines to ("Send to …"). Leave empty to keep the popup to two options. It\'s an ordinary note — its todos show in the MarkTodo Inbox.',
          render: (setting) => {
            setting.addText((text) => {
              text.setPlaceholder("e.g. Catch-all.md").setValue(settings.catchAllPath);
              onCommit(text.inputEl, (value) => {
                const v = value.trim();
                settings.catchAllPath = v && !/\.md$/i.test(v) ? `${v}.md` : v;
                text.setValue(settings.catchAllPath);
                void this.plugin.saveSettings();
              });
            });
          },
        },
        // Default status — applied to new / adopted todos.
        {
          name: "Default status",
          desc: "Status applied to new and adopted todos.",
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const status of STATUS_ORDER) {
                dropdown.addOption(status, settings.statusLabels[status]);
              }
              dropdown.setValue(settings.defaultStatus).onChange((value) => {
                settings.defaultStatus = value as Status;
                void this.plugin.saveSettings();
              });
            });
          },
        },
      ],
    };
  }

  /** Status labels (reindex) — section-header labels recognized in project files — then the editing toggles. */
  private statusLabelsSection(): Section {
    const { settings } = this.plugin;
    return {
      heading: "Status labels",
      rows: [
        ...STATUS_ORDER.map(
          (status): Row => ({
            name: status,
            render: (setting) => {
              setting.addText((text) => {
                text.setPlaceholder(DEFAULT_STATUS_LABELS[status]).setValue(settings.statusLabels[status]);
                onCommit(text.inputEl, (value) => this.enqueue(() => this.commitStatusLabel(status, value, text)));
              });
            },
          }),
        ),
        {
          name: "Maintain status headers in project files",
          desc: "Keep status-section headers in sync inside project files.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.maintainStatusHeaders).onChange((value) => {
                settings.maintainStatusHeaders = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Enable kanban drag on mobile",
          desc: "Allow kanban drag on mobile (else falls back to a tap menu).",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.mobileDragEnabled).onChange((value) => {
                settings.mobileDragEnabled = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Auto-move completed to bottom",
          desc: "Auto-move completed todos to the bottom of flat notes.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.autoMoveCompleted).onChange((value) => {
                settings.autoMoveCompleted = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Inline todo suggest",
          desc: "Type the trigger at the end of any line to turn it into a managed todo.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.inlineSuggestEnabled).onChange((value) => {
                settings.inlineSuggestEnabled = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Inline todo trigger",
          desc: 'Text that opens the inline managed-todo picker (e.g. "mtodo").',
          render: (setting) => {
            setting.addText((text) => {
              text.setPlaceholder(DEFAULT_SETTINGS.inlineTrigger).setValue(settings.inlineTrigger);
              onCommit(text.inputEl, (value) => {
                settings.inlineTrigger = value.trim() || DEFAULT_SETTINGS.inlineTrigger;
                text.setValue(settings.inlineTrigger);
                void this.plugin.saveSettings();
              });
            });
          },
        },
        {
          name: "Inline trigger default",
          desc: "The choice listed first (Enter picks it) when you type the trigger.",
          render: (setting) => {
            setting.addDropdown((dropdown) =>
              dropdown
                .addOption("here", "Create todo here")
                .addOption("editor", "Open todo editor")
                .addOption("catchall", "Send to catch-all note (when set)")
                .setValue(settings.inlineDefaultAction)
                .onChange((value) => {
                  settings.inlineDefaultAction = value === "editor" || value === "catchall" ? value : "here";
                  void this.plugin.saveSettings();
                }),
            );
          },
        },
        {
          name: "Open todo editor after capture",
          desc: "After the trigger creates a todo, open the todo editor on it. Off: just convert the line.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.openEditorAfterCapture).onChange((value) => {
                settings.openEditorAfterCapture = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Style managed todo checkboxes",
          desc: "Show managed-todo checkboxes as the MarkTodo status icons in Live Preview and Reading view.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.styleManagedInEditor).onChange((value) => {
                settings.styleManagedInEditor = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        {
          name: "Smart Enter on managed todos",
          desc: "Pressing Enter on a managed todo creates another managed todo (not a plain checkbox).",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.smartManagedEnter).onChange((value) => {
                settings.smartManagedEnter = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
      ],
    };
  }

  /** Advanced — the machine-only capsule is hidden in the editor by default. */
  private advancedSection(): Section {
    const { settings } = this.plugin;
    return {
      heading: "Advanced",
      rows: [
        {
          name: "Show todo ID capsule in editor",
          desc: "Reveal the hidden <!-- mt id=… --> capsule in Live Preview. Off by default; it's still visible in Source mode.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.showCapsuleInEditor).onChange((value) => {
                settings.showCapsuleInEditor = value;
                void this.plugin.saveSettings();
              }),
            );
          },
        },
        // Excluded folders (reindex) — one folder path per line.
        {
          name: "Excluded folders",
          desc: "Folders excluded from ambient todo scanning, one path per line.",
          render: (setting) => {
            setting.addTextArea((textArea) => {
              textArea.setValue(settings.excludedFolders.join("\n"));
              onCommit(textArea.inputEl, (value) => {
                settings.excludedFolders = value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0);
                void this.plugin.saveSettings();
                void this.plugin.index.rebuildAll();
              });
            });
          },
        },
      ],
    };
  }

  /**
   * The MarkTodo folder. Where things are PUT, never how they are
   * FOUND: discovery stays frontmatter-based, so changing it strands nothing.
   */
  private folderSection(): Section {
    const { settings } = this.plugin;
    return {
      heading: "Folder",
      rows: [
        {
          name: "MarkTodo folder",
          desc:
            "New projects go in its Projects folder; archived ones, when the setting below is on, in its " +
            "Archive folder. Projects are still found by their frontmatter anywhere in the vault. " +
            "Changing it offers to move the folder. Don't add it to Excluded folders — archived notes " +
            "stay indexed on purpose.",
          render: (setting) => {
            setting.addText((text) => {
              text.setPlaceholder(DEFAULT_MARKTODO_FOLDER).setValue(settings.markTodoFolder);
              onCommit(text.inputEl, (value) => this.enqueue(() => this.commitFolder(value, text)));
            });
          },
        },
        {
          name: "Archiving moves the note",
          desc:
            "Off: archiving only sets marktodo-archived in the note's frontmatter and the file stays put. " +
            "On: Obsidian also moves it into the archive folder and rewrites every link to it. " +
            "The MarkTodo app only ever sets the flag, so the move happens the next time you open " +
            "Obsidian — on any device, including your phone.",
          render: (setting) => {
            setting.addToggle((toggle) =>
              toggle.setValue(settings.archiveMovesNote).onChange((value) => {
                settings.archiveMovesNote = value;
                void this.plugin.saveSettings();
                void reconcileArchive(this.app, settings);
              }),
            );
          },
        },
      ],
    };
  }

  /** Contact — always last, like the app's. */
  private contactSection(): Section {
    return {
      heading: "Contact",
      rows: CONTACT_LINKS.map(
        (link): Row => ({
          name: link.name,
          desc: link.desc,
          render: (setting) => {
            setting.addButton((button) => button.setButtonText(link.action).onClick(() => window.open(link.url)));
            const icon = setting.settingEl.createDiv({ cls: `marktodo-contact-icon is-${link.id}` });
            setIcon(icon, link.icon);
            setting.settingEl.prepend(icon);
            // A redraw clears only the controls; the icon would stack up.
            return () => icon.detach();
          },
        }),
      ),
    };
  }

  /**
   * What the app loses when this plugin is off. Obsidian gives a
   * plugin no way to stop being disabled, and a notice on unload would also fire
   * on every update and reload — so the warning lives here, and in the app.
   */
  private appNoteSection(): Section {
    return {
      heading: "Companion app",
      rows: [
        {
          name: "If you turn this plugin off",
          desc:
            "The MarkTodo app reads this plugin's settings from your vault, so it keeps working. But settings " +
            "you change here stop reaching it, and archived projects aren't moved into the Archive folder. " +
            "Uninstalling also deletes the settings file: the app keeps its last copy, but a new install of the " +
            "app starts from the defaults.",
          render: (setting) => {
            // Phones and tablets already have the link under On this device.
            if (!Platform.isMobile) {
              setting.addButton((button) => button.setButtonText("Get the app on Google Play").onClick(openPlayStore));
            }
          },
        },
      ],
    };
  }

  /**
   * On this device — phones and tablets only: Lightweight or the full
   * plugin, stored per device (never in data.json), and the app's listing.
   */
  private deviceSection(): Section {
    const running: DeviceMode = this.plugin.lightweight ? "light" : "full";
    return {
      heading: "On this device",
      rows: [
        {
          name: "MarkTodo on this device",
          desc:
            "Lightweight keeps MarkTodo's checkboxes, the todo trigger and archive filing in your notes, and " +
            "turns off the dashboard and boards so Obsidian stays quick. Only this device changes; it takes " +
            "effect when Obsidian restarts.",
          render: (setting) => {
            setting.addDropdown((dropdown) =>
              dropdown
                .addOption("light", "Lightweight")
                .addOption("full", "Full plugin")
                .setValue(storedDeviceMode(this.app) ?? running)
                .onChange((value) => chooseDeviceMode(this.plugin, value === "full" ? "full" : "light")),
            );
          },
        },
        {
          name: "The MarkTodo app",
          desc: "Made for your phone, working on the same notes as this plugin. Android only for now.",
          render: (setting) => {
            setting.addButton((button) => button.setButtonText("Get it on Google Play").onClick(openPlayStore));
          },
        },
      ],
    };
  }

  /**
   * The MarkTodo folder changed.
   * Offer to move it: one folder rename when the new path is free (Obsidian
   * rewrites every link), project notes one by one when something already lives
   * there, no move when one folder is inside the other. "Only use it for new
   * notes" is always a choice. Resolves once answered and any move has finished.
   */
  private async commitFolder(value: string, text: TextComponent): Promise<void> {
    const { settings } = this.plugin;
    const { vault, fileManager } = this.app;
    const oldRoot = settings.markTodoFolder;
    const newRoot = normalizeFolderRoot(value);
    const restore = (): void => {
      text.setValue(settings.markTodoFolder);
    };
    if (newRoot === oldRoot) return restore();

    const useForNewNotes = async (): Promise<void> => {
      settings.markTodoFolder = newRoot;
      text.setValue(newRoot);
      await this.plugin.saveSettings();
      await reconcileArchive(this.app, settings);
    };
    const ensureFolder = async (path: string): Promise<void> => {
      if (path !== "" && vault.getAbstractFileByPath(path) === null) {
        await vault.createFolder(path).catch(() => {});
      }
    };

    const oldFolder = vault.getAbstractFileByPath(oldRoot);
    const move = planFolderMove(
      oldRoot,
      newRoot,
      oldFolder instanceof TFolder,
      vault.getAbstractFileByPath(newRoot) !== null,
    );
    if (move === "nothing" || !(oldFolder instanceof TFolder)) return useForNewNotes();

    const archiveCaveat = settings.archiveMovesNote
      ? ' Either way, archived notes go to the new Archive folder, because "Archiving moves the note" is on.'
      : "";
    const ask = (opts: {
      message: string;
      details?: string[];
      confirmText: string;
      onConfirm: () => Promise<void>;
      offerNewOnly: boolean;
    }): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const settle = (run: () => Promise<void>): void => void run().then(resolve, reject);
        confirmAction(this.app, {
          title: "Change the MarkTodo folder",
          message: opts.message + archiveCaveat,
          details: opts.details,
          confirmText: opts.confirmText,
          destructive: false,
          alternative: opts.offerNewOnly
            ? { text: "Only use it for new notes", onChoose: () => settle(useForNewNotes) }
            : undefined,
          onConfirm: () => settle(opts.onConfirm),
          onCancel: () => {
            restore();
            resolve();
          },
        });
      });

    if (move === "nested") {
      return ask({
        message: `"${newRoot}" and "${oldRoot}" are inside one another, so the folder can't be moved there. Use "${newRoot}" for new notes only?`,
        confirmText: "Use for new notes",
        onConfirm: useForNewNotes,
        offerNewOnly: false,
      });
    }

    if (move === "rename") {
      const renameFolder = async (): Promise<void> => {
        await ensureFolder(parentFolder(newRoot));
        await fileManager.renameFile(oldFolder, newRoot);
        await useForNewNotes();
        new Notice(`MarkTodo: moved the MarkTodo folder to "${newRoot}".`);
      };
      const files = countFiles(oldFolder);
      if (files === 0) return renameFolder();
      return ask({
        message:
          `Move your MarkTodo folder from "${oldRoot}" to "${newRoot}"? Everything inside it moves ` +
          `(${files} file${files === 1 ? "" : "s"}). Obsidian updates links to them, or asks first if your ` +
          "Files and links settings say to.",
        confirmText: "Move folder",
        onConfirm: renameFolder,
        offerNewOnly: true,
      });
    }

    const moves = perFileMoves(oldRoot, newRoot, getProjectFiles(this.app).map((f) => f.path));
    if (moves.length === 0) return useForNewNotes();
    const moveNotes = async (): Promise<void> => {
      let moved = 0;
      let skipped = 0;
      for (const { from, to } of moves) {
        const file = vault.getAbstractFileByPath(from);
        if (!(file instanceof TFile)) continue;
        if (vault.getAbstractFileByPath(to) !== null) {
          skipped++;
          continue;
        }
        await ensureFolder(parentFolder(to));
        try {
          await fileManager.renameFile(file, to);
          moved++;
        } catch {
          skipped++;
        }
      }
      await useForNewNotes();
      new Notice(
        `MarkTodo: moved ${moved} project note${moved === 1 ? "" : "s"} to "${newRoot}".` +
          (skipped > 0 ? ` ${skipped} stayed put: a note with that name is already there.` : ""),
      );
    };
    const n = moves.length;
    return ask({
      message:
        `"${newRoot}" already exists, so MarkTodo moves its ${n} project note${n === 1 ? "" : "s"} into it ` +
        `and leaves anything else in "${oldRoot}". Obsidian updates links to them, or asks first if your ` +
        "Files and links settings say to.",
      confirmText: `Move ${n} note${n === 1 ? "" : "s"}`,
      onConfirm: moveNotes,
      offerNewOnly: true,
    });
  }

  /**
   * A status label change is a MIGRATION. The label names a heading in every
   * project note, so: plan the rename across them, ask when any note would
   * change, rename the headings, and only then save the label — the old one
   * kept as an alias — and rebuild the index.
   * Resolves once the dialog is answered and any rename has finished.
   */
  private async commitStatusLabel(status: Status, value: string, text: TextComponent): Promise<void> {
    const { settings } = this.plugin;
    const restore = (): void => {
      text.setValue(settings.statusLabels[status]);
    };
    const label = normalizeLabel(status, value);
    if (label === settings.statusLabels[status]) return restore();
    const taken = labelTakenBy(settings.statusLabels, status, label);
    if (taken) {
      new Notice(`MarkTodo: "${label}" is already the label for ${settings.statusLabels[taken]}.`);
      return restore();
    }

    const oldLabels = { ...settings.statusLabels };
    const oldAliases = settings.statusLabelAliases;
    const newLabels = { ...oldLabels, [status]: label };
    const newAliases = nextStatusAliases(oldLabels, oldAliases, newLabels);

    const toRename: TFile[] = [];
    const collided: string[] = [];
    for (const file of getProjectFiles(this.app)) {
      const lines = (await this.app.vault.cachedRead(file)).split(/\r?\n/);
      const plan = planRelabel(lines, oldLabels, oldAliases, newLabels, newAliases);
      if (plan.renamed > 0) toRename.push(file);
      if (plan.collisions.length > 0) collided.push(file.basename);
    }

    const apply = async (): Promise<void> => {
      let renamed = 0;
      for (const file of toRename) {
        renamed += await this.plugin.writer.relabelStatusHeadings(file, oldLabels, oldAliases, newLabels, newAliases);
      }
      settings.statusLabels = newLabels;
      settings.statusLabelAliases = newAliases;
      text.setValue(label);
      await this.plugin.saveSettings();
      await this.plugin.index.rebuildAll();
      if (renamed > 0) {
        new Notice(`MarkTodo: renamed ${renamed} heading${renamed === 1 ? "" : "s"} to "${label}".`);
      }
    };

    if (toRename.length === 0 && collided.length === 0) return apply();

    const notes = (n: number): string => `${n} project note${n === 1 ? "" : "s"}`;
    const listed = (names: string[]): string[] =>
      names.length <= 8 ? names : [...names.slice(0, 8), `and ${names.length - 8} more`];
    const parts: string[] = [];
    if (toRename.length > 0) {
      parts.push(
        `Rename the "${oldLabels[status]}" headings to "${label}" in ${notes(toRename.length)}? ` +
          "Every todo keeps its status.",
      );
    }
    if (collided.length > 0) {
      parts.push(
        `${notes(collided.length)} already ${collided.length === 1 ? "has" : "have"} a heading called ` +
          `"${label}". It will start counting as the ${label} section:`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      confirmAction(this.app, {
        title: "Change status label",
        message: parts.join(" "),
        details: collided.length > 0 ? listed(collided) : undefined,
        confirmText: toRename.length > 0 ? "Rename" : "Change label",
        destructive: false,
        onConfirm: () => void apply().then(resolve, reject),
        onCancel: () => {
          restore();
          resolve();
        },
      });
    });
  }

  /**
   * Appearance — the plugin's own, like the app's Settings →
   * Appearance but separate from it: changing one never changes the other.
   * Applies live; no pane needs reopening.
   */
  private appearanceSection(): Section {
    const { settings } = this.plugin;
    const apply = (): void => {
      void this.plugin.saveSettings();
      this.plugin.theme.refresh();
      this.redraw();
    };
    const marktodoStyle = (): boolean => settings.appearance.style === "marktodo";

    return {
      heading: "Appearance",
      rows: [
        {
          name: "Theme",
          desc:
            "MarkTodo: the companion app's colors in MarkTodo's panes and dialogs — surfaces tinted " +
            "with your accent, status colors tuned for contrast. Obsidian theme: your current theme's colors.",
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const { key, label } of THEME_STYLES) dropdown.addOption(key, label);
              dropdown.setValue(settings.appearance.style).onChange((value) => {
                settings.appearance = { ...settings.appearance, style: value as ThemeStyle };
                apply();
              });
            });
          },
        },
        {
          name: "Mode",
          desc: "Match Obsidian follows its light/dark setting. Black is dark with a true-black background.",
          visible: marktodoStyle,
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const { key, label } of THEME_MODES) dropdown.addOption(key, label);
              dropdown.setValue(settings.appearance.mode).onChange((value) => {
                settings.appearance = { ...settings.appearance, mode: value as ThemeMode };
                apply();
              });
            });
          },
        },
        {
          name: "Accent",
          visible: marktodoStyle,
          render: (setting) => {
            setting.setDesc(
              settings.appearance.accent === "obsidian" ? "Obsidian's accent color" : ACCENTS[settings.appearance.accent].label,
            );
            const row = setting.controlEl.createDiv({ cls: "marktodo-swatches" });
            const dark =
              settings.appearance.mode === "obsidian" ? document.body.hasClass("theme-dark") : settings.appearance.mode !== "light";
            const read = (name: string): string => getComputedStyle(document.body).getPropertyValue(name);
            const obsidianAccent = parseObsidianAccent(read("--accent-h"), read("--accent-s"), read("--accent-l"));
            const choices: Array<[AccentKey, string]> = [
              ["obsidian", "Match Obsidian's accent"],
              ...Object.entries(ACCENTS).map(([key, a]) => [key as AccentKey, a.label] as [AccentKey, string]),
            ];
            for (const [key, label] of choices) {
              const hsl = key === "obsidian" ? obsidianAccent : ACCENTS[key];
              const { primary } = buildTheme(dark ? "dark" : "light", hsl).colors;
              const swatch = row.createEl("button", {
                cls: `marktodo-swatch${settings.appearance.accent === key ? " is-active" : ""}${key === "obsidian" ? " is-obsidian" : ""}`,
                attr: { "aria-label": label, title: label },
              });
              swatch.setCssProps({ "--swatch": primary });
              swatch.addEventListener("click", () => {
                settings.appearance = { ...settings.appearance, accent: key };
                apply();
              });
            }
          },
        },
      ],
    };
  }

  /** Where the dashboard lives, and one column or two. */
  private layoutSection(): Section {
    const { settings } = this.plugin;
    return {
      heading: "Layout",
      rows: [
        {
          name: "Dashboard opens in",
          desc:
            "Where the MarkTodo dashboard lives. It always gets a tab group of its own: nothing — not your notes, " +
            "not a new tab, not another sidebar view — opens over it. In the main area its tab is pinned.",
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const { key, label } of DASHBOARD_LOCATIONS) dropdown.addOption(key, label);
              dropdown.setValue(settings.dashboardLocation).onChange((value) => {
                settings.dashboardLocation = value as DashboardLocation;
                void this.plugin.saveSettings();
                // Move it now, so the choice is visible while you are making it.
                void openDashboard(this.plugin, { resize: true });
              });
            });
          },
        },
        {
          name: "Dashboard columns",
          desc:
            "Two columns: the navigation on the left, the list you picked beside it. One column: the navigation, " +
            "and picking something opens its list with a back button. Phones always use one column, and so does " +
            "a dashboard too narrow for two. Kanban boards and project notes open as tabs in the main area.",
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const { key, label } of PANE_MODES) dropdown.addOption(key, label);
              dropdown.setValue(settings.paneMode).onChange((value) => {
                settings.paneMode = value as PaneMode;
                void this.plugin.saveSettings();
                this.plugin.refreshDashboards();
                // Two columns need room: widen a sidebar dashboard if it is narrow.
                if (settings.paneMode === "dual") void openDashboard(this.plugin, { resize: true });
              });
            });
          },
        },
        {
          name: "Navigation column side",
          desc:
            "In two columns, which side the navigation sits on — the list goes on the other. " +
            "In one column, the list slides in from the other side.",
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              for (const { key, label } of NAV_SIDES) dropdown.addOption(key, label);
              dropdown.setValue(settings.navSide).onChange((value) => {
                settings.navSide = value as NavSide;
                void this.plugin.saveSettings();
                this.plugin.refreshDashboards();
              });
            });
          },
        },
      ],
    };
  }
}

/** Obsidian's settings dialog — not in the public API, but stable and widely used. */
interface SettingInternals {
  setting?: { open(): void; openTabById(id: string): unknown };
}

/** Settings → MarkTodo, from outside Obsidian (the app's `obsidian://marktodo-settings`). */
export function openSettingsTab(plugin: MarkTodoPlugin): void {
  const { setting } = plugin.app as unknown as SettingInternals;
  if (!setting) return;
  setting.open();
  setting.openTabById(plugin.manifest.id);
}

/** Files anywhere under a folder. */
function countFiles(folder: TFolder): number {
  let n = 0;
  for (const child of folder.children) n += child instanceof TFolder ? countFiles(child) : 1;
  return n;
}
