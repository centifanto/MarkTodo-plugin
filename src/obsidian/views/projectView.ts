/**
 * A project's board. A project's LIST
 * lives in the dashboard's list column; this tab is its Kanban board, and its
 * switch offers List (back to the dashboard, closing the board) and Source (the
 * note itself, in this same tab).
 *
 * In older versions a project's detail view WAS its note. The note is
 * still the source of truth and still one click away; this is a cleaner way to
 * work it. Source mode is the note itself in an ordinary markdown tab — not a
 * view of ours pretending to be one — so every editor feature keeps working,
 * and `projectNoteActions.ts` gives that tab its way back.
 *
 * State is `{ file, mode }`. The file is tracked through renames; a deleted
 * project closes its tab.
 */
import { ItemView, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { type Status } from "../../core/types";
import { VIEW_TYPES } from "../../ui/paneLayout";
import { openCaptureEditor } from "../quickAdd";
import { buildViewBar } from "../viewBar";
import { type ModalAnchor } from "../modalAnchor";
import { openBoard, showInDashboard } from "../layout";
import { PROJECT_ICON } from "../../ui/iconMaps";
import { PROJECT_MODES, TodoSurface, buildModeSwitch, type BoardMode } from "./todoSurface";
import { filterByState, type FilterState } from "../filterBar";
import { THEME_CLASS } from "../themeStyles";
import type MarkTodoPlugin from "../../../main";

export const PROJECT_VIEW_TYPE = VIEW_TYPES.project;
/** Shared with the dashboard's project list: one bar state for a project, however it is drawn. */
const MEMORY_KEY = "project";

export class ProjectView extends ItemView {
  private path: string | null = null;
  private unsubscribe?: () => void;
  private toolbarEl: HTMLElement | null = null;
  private surface: TodoSurface | null = null;
  private dirty = false;
  /** Shared with this project's list through `MEMORY_KEY`, so both narrow alike. */
  private filterState: FilterState = {};

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkTodoPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return PROJECT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file()?.basename ?? "Project";
  }

  getIcon(): string {
    return PROJECT_ICON;
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), file: this.path };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const s = (state ?? {}) as { file?: unknown; mode?: unknown };
    if (typeof s.file === "string") this.path = s.file;
    await super.setState(state, result);
    // An older project LIST tab restored from a saved workspace.
    if (s.mode === "list") {
      this.setMode("list");
      return;
    }
    this.refreshHeader();
    this.renderToolbar();
    this.surface?.invalidate();
    this.renderContent();
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass(THEME_CLASS);
    this.addAction("plus", "Add todo", (evt) => this.addTodo(undefined, evt));
    this.contentEl.empty();
    this.contentEl.addClass("marktodo-view", "marktodo-surface-view", "is-kanban");
    this.toolbarEl = this.contentEl.createDiv({ cls: "marktodo-toolbar" });
    this.surface = new TodoSurface({
      plugin: this.plugin,
      el: this.contentEl.createDiv({ cls: "marktodo-surface" }),
      emptyText: () => "No todos in this project yet. Add one with +.",
      onAdd: (status, anchor) => this.addTodo(status, anchor),
      showProject: false,
      memoryKey: MEMORY_KEY,
    });
    this.renderToolbar();
    this.renderContent();
    this.unsubscribe = this.plugin.index.onChange(() => {
      this.renderToolbar();
      this.renderContent();
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.flush()));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (oldPath !== this.path) return;
        this.path = file.path;
        this.refreshHeader();
        this.app.workspace.requestSaveLayout();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file.path === this.path) this.leaf.detach();
      }),
    );
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.surface?.destroy();
    this.surface = null;
  }

  private file(): TFile | null {
    const file = this.path === null ? null : this.app.vault.getAbstractFileByPath(this.path);
    return file instanceof TFile ? file : null;
  }

  private flush(): void {
    if (this.dirty) this.renderContent();
  }

  /**
   * The tab AND view-header titles follow the note's name. Obsidian sets the
   * header title once, when the view loads — before `setState` has told us which
   * project this is — and `updateHeader` only repaints the tab. Both internal,
   * both guarded.
   */
  private refreshHeader(): void {
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    (this as unknown as { titleEl?: HTMLElement }).titleEl?.setText(this.getDisplayText());
  }

  private setMode(mode: BoardMode): void {
    const path = this.path;
    if (path === null) return;
    if (mode === "list") {
      void showInDashboard(this.plugin, { kind: "project", path }).then(() => this.leaf.detach());
    } else if (mode === "source") {
      void openBoard(this.plugin, { kind: "project", path, mode: "source" }, this.leaf);
    }
  }

  /**
   * One bar, with the mode switch riding in its head — the same shape the Todos
   * board uses, so List ⇄ Kanban ⇄ Source sits in one place on every surface
   * rather than above the bar here and inside it there.
   *
   * No sort: a board's order is the one you set by dragging. Filters it does
   * have — "already one project" rules out the PROJECT picker, not tag,
   * priority or managed — and they are the same `MEMORY_KEY` as this project's
   * list, so narrowing it in the dashboard narrows it here too.
   */
  private renderToolbar(): void {
    if (!this.toolbarEl) return;
    this.toolbarEl.empty();
    const memory = this.plugin.viewMemory(MEMORY_KEY);
    this.filterState = memory.filters;
    const all = this.path === null ? [] : this.plugin.index.getByFile(this.path);
    const lead = createDiv();
    buildModeSwitch(lead, PROJECT_MODES, "kanban", (mode) => this.setMode(mode));
    buildViewBar(this.toolbarEl.createDiv({ cls: "marktodo-toolbar-bar" }), {
      app: this.app,
      todos: filterByState(all, this.filterState, "projects"),
      lead: lead.firstElementChild as HTMLElement,
      layout: { key: "kanban", label: "Kanban" },
      focus: {
        current: this.plugin.settings.focus,
        onPick: (focus) => {
          this.plugin.settings.focus = focus;
          void this.plugin.saveSettings();
          this.renderToolbar();
          this.surface?.invalidate();
          this.renderContent();
        },
      },
      filters: {
        state: this.filterState,
        surface: "projects",
        onChange: () => {
          this.plugin.rememberView(MEMORY_KEY, { filters: this.filterState });
          this.renderToolbar();
          this.renderContent();
        },
      },
      collapsed: memory.focusCollapsed,
      onToggleCollapsed: (collapsed) => {
        this.plugin.rememberView(MEMORY_KEY, { focusCollapsed: collapsed });
        this.renderToolbar();
      },
    });
  }

  private renderContent(): void {
    if (!this.surface) return;
    if (!this.containerEl.isShown()) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    const all = this.path === null ? [] : this.plugin.index.getByFile(this.path);
    this.surface.render(filterByState(all, this.filterState, "projects"), "kanban");
  }

  private addTodo(status?: Status, anchor?: ModalAnchor): void {
    openCaptureEditor(this.plugin, { status, projectPath: this.path ?? undefined, anchor });
  }
}
