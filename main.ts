import { addIcon, Notice, Platform, Plugin, normalizePath, type Editor, type TFile } from "obsidian";
import { reconcileArchive } from "./src/obsidian/archiveReconcile";
import { LOGO_ICON, LOGO_SVG } from "./src/ui/logo";
import { BRAND_ICONS } from "./src/ui/brandIcons";
import {
  DEFAULT_SETTINGS,
  type MarkTodoSettings,
  type ViewMemory,
} from "./src/obsidian/settings";
import { TodoIndex } from "./src/obsidian/index";
import { Writer } from "./src/obsidian/writer";
import { TodosView, TODOS_VIEW_TYPE } from "./src/obsidian/views/todosView";
import { ProjectView, PROJECT_VIEW_TYPE } from "./src/obsidian/views/projectView";
import { LEGACY_BOARD_TYPE, LEGACY_LIST_TYPES, LegacyView } from "./src/obsidian/views/legacyViews";
import { NavView, NAV_VIEW_TYPE } from "./src/obsidian/views/navView";
import { DashboardGuard, openBoard, openDashboard, showInDashboard } from "./src/obsidian/layout";
import { registerProjectNoteActions } from "./src/obsidian/projectNoteActions";
import { ThemeStyles } from "./src/obsidian/themeStyles";
import { parseAppearance, parseFontScale } from "./src/ui/theme";
import { parseFocus } from "./src/ui/focus";
import { DEFAULT_LIST_SORT, parseSort } from "./src/ui/sorts";
import { migrateArrangements } from "./src/obsidian/arrangementMigration";
import { parseDashboardLocation } from "./src/ui/paneLayout";
import { parseSelection } from "./src/ui/dashboardNav";
import { getProjectFiles, isProjectFrontmatter } from "./src/obsidian/projects";
import { PROJECT_FM_KEY } from "./src/core/noteMeta";
import { openCaptureEditor, sendLineToNote } from "./src/obsidian/quickAdd";
import { captureStatus } from "./src/obsidian/inlineLogic";
import { type Placement } from "./src/obsidian/placement";
import { parseTodoLine } from "./src/core/parse";
import { openTodoModalForLine } from "./src/obsidian/todoModal";
import { TodoSuggest } from "./src/obsidian/todoSuggest";
import { createProject } from "./src/obsidian/createProject";
import { insertManagedTodoLine, convertCurrentLine } from "./src/obsidian/inlineTodo";
import {
  managedLineDecorations,
  managedEnterExtension,
  priorityAliasExtension,
  hideCapsuleExtension,
  managedReadingCheckboxes,
  registerManagedCheckboxMasks,
  managedCheckboxClick,
} from "./src/obsidian/editorExtensions";
import { PRIORITY_ICONS, STATUS_ICONS } from "./src/ui/iconMaps";
import { glyphIconContent } from "./src/ui/statusGlyphs";
import { priorityIconContent } from "./src/ui/priorityGlyphs";
import { PRIORITY_ORDER, STATUS_ORDER } from "./src/core/types";
import {
  derivedFolders,
  normalizeFolderRoot,
  rootFromLegacy,
  shouldCreateFolderOnInstall,
} from "./src/obsidian/folderLogic";
import { MarkTodoSettingTab, openSettingsTab } from "./src/obsidian/settingsTab";
import { SETTINGS_URI_ACTION } from "./src/obsidian/links";
import { AppOfferModal, LightweightView, storedDeviceMode } from "./src/obsidian/deviceMode";
import { effectiveDeviceMode, shouldOfferApp } from "./src/obsidian/deviceModeLogic";

export default class MarkTodoPlugin extends Plugin {
  // `Plugin` declares `settings?: unknown`; override with our concrete type.
  declare settings: MarkTodoSettings;
  index!: TodoIndex;
  writer!: Writer;
  theme!: ThemeStyles;
  /** No data.json when the plugin loaded: a fresh install in this vault. */
  private firstInstall = false;
  /** Pins read out of an older data.json, waiting for a vault to write them to. */
  private legacyPins: string[] = [];
  /**
   * Lightweight mode: the default on phones and tablets, chosen per
   * device. No todo index, no dashboard, no boards — the editor features, the
   * settings and archive filing stay. Fixed for the session.
   */
  lightweight = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    const deviceMode = storedDeviceMode(this.app);
    this.lightweight = effectiveDeviceMode(deviceMode, Platform.isMobile) === "light";

    // MarkTodo's accent and status colors before any pane draws, so nothing flashes
    // in Obsidian's colors first.
    this.theme = new ThemeStyles(this);
    this.theme.register();

    // MarkTodo's own glyphs — status rounded squares, priority bars — before any
    // view, menu or modal paints one.
    for (const status of STATUS_ORDER) addIcon(STATUS_ICONS[status], glyphIconContent(status));
    for (const priority of PRIORITY_ORDER) {
      if (priority !== "NONE") addIcon(PRIORITY_ICONS[priority], priorityIconContent(priority));
    }

    // Writer before index: the index's heal rule calls the
    // writer on incremental re-indexes, so it must already exist.
    this.writer = new Writer(this.app, () => this.settings);
    this.index = new TodoIndex(this, () => this.settings);
    // Lightweight: built but never started — no vault read, no events, so no heal.
    // Editor features that look a todo up fall back to the line itself.
    if (!this.lightweight) await this.index.initialize();

    this.addSettingTab(new MarkTodoSettingTab(this.app, this));
    // The app's "Change in Obsidian" button (links.ts). Lightweight too — the
    // settings are there. After layout-ready: a cold start from the link would
    // otherwise open the dialog before the window exists.
    this.registerObsidianProtocolHandler(SETTINGS_URI_ACTION, () => {
      this.app.workspace.onLayoutReady(() => openSettingsTab(this));
    });

    // The archived FLAG is canonical; the archive folder is
    // its materialized view. The companion app can only set the flag (no SAF
    // move), so the desktop reconciles location on load. After layout-ready, so
    // a vault-wide rename never blocks startup.
    this.app.workspace.onLayoutReady(() => {
      // Before the archive reconcile, which may MOVE notes: a stored pin is a
      // path, and a moved note's path is stale the moment it lands.
      void this.migratePins();
      void this.createFolderOnInstall();
      void reconcileArchive(this.app, this.settings).catch(() => 0);
      if (shouldOfferApp(deviceMode, Platform.isMobile)) new AppOfferModal(this, true).open();
    });

    const legacyTypes = [...Object.keys(LEGACY_LIST_TYPES), LEGACY_BOARD_TYPE];
    if (this.lightweight) {
      // Same view types, one stand-in: a saved MarkTodo tab says why it's empty.
      for (const type of [TODOS_VIEW_TYPE, PROJECT_VIEW_TYPE, NAV_VIEW_TYPE, ...legacyTypes]) {
        this.registerView(type, (leaf) => new LightweightView(leaf, this, type));
      }
    } else {
      this.registerView(TODOS_VIEW_TYPE, (leaf) => new TodosView(leaf, this));
      this.registerView(PROJECT_VIEW_TYPE, (leaf) => new ProjectView(leaf, this));
      // Tabs from older versions: every list now lives in the dashboard.
      for (const type of legacyTypes) {
        this.registerView(type, (leaf) => new LegacyView(leaf, this, type));
      }
      this.registerView(NAV_VIEW_TYPE, (leaf) => new NavView(leaf, this));
    }

    this.registerEditorSuggest(new TodoSuggest(this));
    if (!this.lightweight) {
      // Nothing opens over the dashboard.
      new DashboardGuard(this).register();
      // A project note (Source mode) gets List / Kanban buttons back.
      registerProjectNoteActions(this);
    }

    // Live-Preview: style managed-todo checkboxes + smart Enter (both setting-gated).
    this.registerEditorExtension([
      managedLineDecorations(this),
      hideCapsuleExtension(this),
      managedEnterExtension(this),
      priorityAliasExtension(),
    ]);
    registerManagedCheckboxMasks(this);
    // Reading view isn't CM6 — a post-processor classes managed todo <li>s so the
    // same icon masks apply there too.
    this.registerMarkdownPostProcessor(managedReadingCheckboxes(this));
    // Clicking a managed checkbox (either surface) opens the status menu instead of
    // Obsidian's [ ]↔[x] toggle — capture phase, so it runs before Obsidian's handlers.
    this.registerDomEvent(window, "click", managedCheckboxClick(this), { capture: true });

    addIcon(LOGO_ICON, LOGO_SVG);
    // Discord and X logos for Settings → Contact.
    for (const [id, svg] of Object.entries(BRAND_ICONS)) addIcon(id, svg);
    // ONE ribbon icon: the dashboard is the front door, and every
    // list is a click inside it. Command ids from older versions are kept, so
    // any hotkey you bound still works.
    this.addRibbonIcon(LOGO_ICON, "Open MarkTodo", () => {
      void this.activateNav();
    });

    // Ids kept from older versions so existing hotkeys still work.
    this.addCommand({
      id: "open-nav",
      name: "Open dashboard",
      callback: () => {
        void this.activateNav();
      },
    });

    this.addCommand({
      id: "open-list",
      name: "Show todos",
      callback: () => {
        void showInDashboard(this, { kind: "todos" });
      },
    });

    this.addCommand({
      id: "open-board",
      name: "Open todos as a Kanban board",
      callback: () => {
        void openBoard(this, { kind: "todos" });
      },
    });

    this.addCommand({
      id: "open-today",
      name: "Show today",
      callback: () => {
        void showInDashboard(this, { kind: "today" });
      },
    });

    this.addCommand({
      id: "open-inbox",
      name: "Show inbox",
      callback: () => {
        void showInDashboard(this, { kind: "inbox" });
      },
    });

    this.addCommand({
      id: "toggle-columns",
      name: "Toggle one or two dashboard columns",
      callback: () => {
        this.settings.paneMode = this.settings.paneMode === "dual" ? "single" : "dual";
        void this.saveSettings();
        this.refreshDashboards();
      },
    });

    // Id kept from an older version so existing hotkeys still work.
    this.addCommand({
      id: "add-to-inbox",
      name: "Add todo…",
      callback: () => openCaptureEditor(this),
    });

    // Capture in place: managed todos may live in any note — projects get
    // the default status, loose notes start at Backlog.
    this.addCommand({
      id: "insert-managed-todo",
      name: "Insert managed todo at cursor",
      editorCallback: (editor: Editor, ctx) => {
        const status =
          this.fileKind(ctx.file) === "project" ? this.settings.defaultStatus : "BACKLOG";
        insertManagedTodoLine(editor, status);
      },
    });

    this.addCommand({
      id: "convert-line",
      name: "Convert current line to managed todo",
      editorCallback: (editor: Editor, ctx) => {
        const placement = this.fileKind(ctx.file);
        const todo = parseTodoLine(editor.getLine(editor.getCursor().line));
        // Loose → keep a check-off status, else Backlog.
        const force =
          placement === "project" || !todo
            ? undefined
            : captureStatus(placement, todo, true, this.settings.defaultStatus);
        convertCurrentLine(editor, force);
      },
    });

    // Todo editor from a note: command (hotkey-able) + editor context menu.
    this.addCommand({
      id: "edit-todo-at-cursor",
      name: "Edit todo at cursor",
      editorCheckCallback: (checking, editor, ctx) => {
        const n = editor.getCursor().line;
        if (!ctx.file || parseTodoLine(editor.getLine(n)) === null) return false;
        if (!checking) openTodoModalForLine(this, ctx.file, n, editor.getLine(n));
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const n = editor.getCursor().line;
        const file = info.file;
        if (!file || parseTodoLine(editor.getLine(n)) === null) return;
        menu.addItem((item) =>
          item
            .setTitle("Edit todo in MarkTodo")
            .setIcon("square-pen")
            // Opens where the menu was clicked (a keyboard pick opens centred).
            .onClick((evt) => openTodoModalForLine(this, file, n, editor.getLine(n), evt)),
        );
      }),
    );

    // Only when a catch-all note is set.
    this.addCommand({
      id: "send-line-to-catch-all",
      name: "Send current line to catch-all note",
      editorCheckCallback: (checking, editor: Editor, ctx) => {
        const path = this.settings.catchAllPath.trim();
        if (!path || ctx.file?.path === normalizePath(path)) return false;
        if (!checking) {
          const line = editor.getCursor().line;
          void this.writer.ensureNote(path).then((target) => {
            if (target) void sendLineToNote(this, editor, line, target);
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: "create-project",
      name: "Create project…",
      callback: () => createProject(this),
    });

    this.addCommand({
      id: "convert-to-project",
      name: "Convert note to project",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (isProjectFrontmatter(fm)) return false; // already one
        if (!checking) {
          void this.app.fileManager
            .processFrontMatter(file, (f: Record<string, unknown>) => {
              f[PROJECT_FM_KEY] = true;
            })
            .then(() =>
              new Notice(
                `MarkTodo: "${file.basename}" is now a project. Use "Adopt all todos" to manage its todos.`,
              ),
            );
        }
        return true;
      },
    });

    this.addCommand({
      id: "adopt-note",
      name: "Adopt all todos in current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void this.writer.adoptNote(file).then((n) =>
            new Notice(
              n > 0
                ? `MarkTodo: adopted ${n} todo(s)`
                : "MarkTodo: no unmanaged todos in this note",
            ),
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: "move-completed-bottom",
      name: "Move completed todos to bottom (current note)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void this.writer.moveCompletedToBottom(file).then((n) =>
            new Notice(
              n > 0
                ? `MarkTodo: moved ${n} completed todo(s)`
                : "MarkTodo: no completed todos in this note",
            ),
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: "log-index-stats",
      name: "Show index stats",
      callback: () => {
        const s = this.index.stats();
        new Notice(
          `MarkTodo: ${s.todos} todos (${s.managed} managed) across ${s.files} files`,
        );
      },
    });

  }

  onunload(): void {
    // Views, events, the editor suggest, and the code-block processor are all
    // registered via register*/registerView, so Obsidian detaches them itself.
  }

  /** A note's placement: a project by its frontmatter key, else loose. */
  fileKind(file: TFile | null): Placement {
    if (!file) return "loose";
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return isProjectFrontmatter(fm) ? "project" : "loose";
  }

  /**
   * Show the dashboard where Settings → Layout puts it, in a tab
   * group of its own. Kept as a method: the ribbon, the command and settings
   * all come through here.
   */
  async activateNav(): Promise<void> {
    await openDashboard(this);
  }

  /** Re-apply layout settings, and redraw lists, in every open dashboard. */
  refreshDashboards(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(NAV_VIEW_TYPE)) {
      if (leaf.view instanceof NavView) leaf.view.refreshLayout();
    }
  }

  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    this.firstInstall = raw == null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    // Older data.json files store two folders instead of one MarkTodo folder;
    // the pair usually implies the root (`X/Projects` + `X/Archive`).
    const stored = (raw as Partial<MarkTodoSettings> | null)?.markTodoFolder;
    this.settings.markTodoFolder =
      typeof stored === "string"
        ? normalizeFolderRoot(stored)
        : rootFromLegacy(
            (raw as Partial<MarkTodoSettings> | null)?.projectsFolder,
            (raw as Partial<MarkTodoSettings> | null)?.archiveFolder,
          );
    Object.assign(this.settings, derivedFolders(this.settings.markTodoFolder));
    this.settings.viewMemory = { ...(this.settings.viewMemory ?? {}) };
    // A data.json written before the navigator existed has neither.
    this.settings.nav = { ...DEFAULT_SETTINGS.nav, ...(this.settings.nav ?? {}) };
    // Pins moved into the notes (`marktodo-pinned`). Stash the stored paths and
    // drop the setting; the notes themselves are written once the vault is up.
    const storedPins: unknown = (this.settings.nav as { pinned?: unknown }).pinned;
    this.legacyPins = Array.isArray(storedPins)
      ? (storedPins as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    Reflect.deleteProperty(this.settings.nav, "pinned");
    // Lists live in the dashboard; the older tab settings are gone.
    Reflect.deleteProperty(this.settings, "viewModes");
    Reflect.deleteProperty(this.settings, "listLocation");
    this.settings.nav.selected = parseSelection(this.settings.nav.selected);
    if (this.settings.nav.singleView !== "list") this.settings.nav.singleView = "nav";
    if (!Number.isFinite(this.settings.nav.navWidth)) this.settings.nav.navWidth = DEFAULT_SETTINGS.nav.navWidth;
    if (this.settings.paneMode !== "single") this.settings.paneMode = "dual";
    if (this.settings.navSide !== "right") this.settings.navSide = "left";
    this.settings.appearance = parseAppearance(this.settings.appearance);
    this.settings.fontScale = parseFontScale(this.settings.fontScale);
    this.settings.focus = parseFocus(this.settings.focus);
    this.settings.dashboardLocation = parseDashboardLocation(this.settings.dashboardLocation);
    if (!(Number.isFinite(this.settings.dashboardWidth) && this.settings.dashboardWidth >= 160)) {
      this.settings.dashboardWidth = DEFAULT_SETTINGS.dashboardWidth;
    }
    // List and Kanban were merged into Todos: its filters start from the List's.
    const memory = this.settings.viewMemory;
    if (!memory.todos && memory.list) memory.todos = memory.list;
    Reflect.deleteProperty(memory, "list");
    Reflect.deleteProperty(memory, "kanban");
    // The filter bar no longer collapses on its own: focus, filters and sort
    // share one view bar with one collapse (`focusCollapsed`, open by default),
    // so the old per-view `collapsed` flag has nothing left to mean.
    for (const entry of Object.values(memory)) Reflect.deleteProperty(entry, "collapsed");
    this.settings.todayArrangement = migrateArrangements(this.settings.todayArrangement);
    // The Inbox note is retired: drop its setting, and map the old
    // "Send to Inbox" keyword default to "Create todo here".
    Reflect.deleteProperty(this.settings, "inboxPath");
    // Projects are `marktodo: true`, not a setting. No release shipped a
    // custom key, so a stored one is dropped, not migrated.
    Reflect.deleteProperty(this.settings, "projectKey");
    const action: string = this.settings.inlineDefaultAction;
    if (action !== "here" && action !== "editor" && action !== "catchall") {
      this.settings.inlineDefaultAction = "here";
    }
    // Status names and their order are MarkTodo's, not a setting: a data.json
    // that still carries the old fields drops them (a heading left on a custom
    // label is renamed the next time a todo is placed in that note).
    Reflect.deleteProperty(this.settings, "statusLabels");
    Reflect.deleteProperty(this.settings, "statusLabelAliases");
    Reflect.deleteProperty(this.settings, "statusColumnOrder");
  }

  /** A view's remembered filters + view-bar state; defaults to expanded, unfiltered, file order. */
  viewMemory(key: string): ViewMemory {
    const m = this.settings.viewMemory[key];
    return {
      filters: { ...(m?.filters ?? {}) },
      focusCollapsed: m?.focusCollapsed ?? false,
      sections: [...(m?.sections ?? [])],
      sort: parseSort(m?.sort, "list", DEFAULT_LIST_SORT),
    };
  }

  /** Update a view's memory and persist it. */
  rememberView(key: string, patch: Partial<ViewMemory>): void {
    const next = { ...this.viewMemory(key), ...patch };
    this.settings.viewMemory[key] = {
      filters: { ...next.filters },
      focusCollapsed: next.focusCollapsed,
      sections: [...next.sections],
      sort: next.sort,
    };
    void this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    Object.assign(this.settings, derivedFolders(this.settings.markTodoFolder));
    await this.saveData(this.settings);
  }

  /**
   * One-time: write `marktodo-pinned` into the notes an older data.json pinned
   * by path. Deferred to layout-ready because `loadSettings` runs before there
   * is a vault to write to. A path that no longer resolves to a note is simply
   * dropped — which is what a path-keyed pin did on rename anyway. Saving the
   * pin-less settings at the end is what makes this run exactly once.
   */
  private async migratePins(): Promise<void> {
    const paths = this.legacyPins;
    this.legacyPins = [];
    if (paths.length === 0) return;
    for (const path of paths) {
      await this.writer.setPinned(path, true).catch(() => {});
    }
    await this.saveSettings();
  }

  /**
   * First install: create `<MarkTodo folder>/Projects` so the folder is
   * there to find — only in a vault with no MarkTodo projects yet, so a reinstall
   * or a synced device never adds a default folder beside the user's own. Writes
   * data.json either way, so this is decided once.
   */
  private async createFolderOnInstall(): Promise<void> {
    if (!this.firstInstall) return;
    this.firstInstall = false;
    const { vault } = this.app;
    const folder = this.settings.projectsFolder;
    const create = shouldCreateFolderOnInstall(
      true,
      getProjectFiles(this.app).length,
      vault.getAbstractFileByPath(folder) !== null,
    );
    if (create) await vault.createFolder(folder).catch(() => {});
    await this.saveSettings();
  }
}
