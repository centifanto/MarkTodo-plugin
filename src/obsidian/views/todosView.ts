/**
 * The Todos board — every project todo as a Kanban board, in a tab in
 * the main area. Todos as a LIST lives in the dashboard's list column now; this
 * tab's List switch goes back there and closes the board.
 */
import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { type Status } from "../../core/types";
import { VIEW_TYPES } from "../../ui/paneLayout";
import { filterByState, filterOptionsSignature, type FilterState } from "../filterBar";
import { openCaptureEditor } from "../quickAdd";
import { buildViewBar } from "../viewBar";
import { focusCounts } from "../../ui/focus";
import { type ModalAnchor } from "../modalAnchor";
import { projectPathByName } from "../projects";
import { showInDashboard } from "../layout";
import { TodoSurface, TODOS_MODES, buildModeSwitch } from "./todoSurface";
import { THEME_CLASS } from "../themeStyles";
import type MarkTodoPlugin from "../../../main";

export const TODOS_VIEW_TYPE = VIEW_TYPES.todos;
/** Shared with the dashboard's Todos list: one set of filters for Todos, however it is drawn. */
const MEMORY_KEY = "todos";

export class TodosView extends ItemView {
  private unsubscribe?: () => void;
  private filterState: FilterState = {};
  private barEl: HTMLElement | null = null;
  private barSig: string | null = null;
  private surface: TodoSurface | null = null;
  /** An index change arrived while hidden — rebuild when this view is shown. */
  private dirty = false;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkTodoPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TODOS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Todos";
  }

  getIcon(): string {
    return "columns-3";
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    // An older Todos LIST tab restored from a saved workspace.
    if ((state as { mode?: unknown } | null)?.mode === "list") this.toList();
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass(THEME_CLASS);
    this.filterState = this.plugin.viewMemory(MEMORY_KEY).filters;
    this.addAction("plus", "Add todo", (evt) => this.addTodo(undefined, evt));
    this.contentEl.empty();
    this.contentEl.addClass("marktodo-view", "marktodo-surface-view", "is-kanban");
    this.barEl = this.contentEl.createDiv();
    this.surface = new TodoSurface({
      plugin: this.plugin,
      el: this.contentEl.createDiv({ cls: "marktodo-surface" }),
      emptyText: () => "",
      onAdd: (status, anchor) => this.addTodo(status, anchor),
      showProject: true,
      memoryKey: MEMORY_KEY,
    });
    this.renderViewBar();
    this.renderContent();
    // An index change can add or rename projects → the bar's options too.
    this.unsubscribe = this.plugin.index.onChange(() => {
      this.renderViewBar();
      this.renderContent();
    });
    // A background tab draws nothing; this is when it comes back to the front.
    this.registerEvent(this.app.workspace.on("layout-change", () => this.flush()));
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.surface?.destroy();
    this.surface = null;
  }

  private flush(): void {
    if (this.dirty) this.renderContent();
  }

  /** The List switch: Todos as a list, in the dashboard — and this board closes. */
  private toList(): void {
    void showInDashboard(this.plugin, { kind: "todos" }).then(() => this.leaf.detach());
  }

  /**
   * (Re)build the view bar only when what it draws changes, so an index update
   * never tears down a picker you have open. The mode switch rides in its head
   * row and is rebuilt with it.
   *
   * No sort column here: this tab is the BOARD, whose order is the one you set
   * by dragging cards.
   */
  private renderViewBar(): void {
    if (!this.barEl) return;
    const all = this.plugin.index.getAll();
    const todos = filterByState(all, this.filterState, "projects");
    const focus = this.plugin.settings.focus;
    const memory = this.plugin.viewMemory(MEMORY_KEY);
    const sig = JSON.stringify([
      filterOptionsSignature(all),
      this.filterState,
      focus,
      focusCounts(todos),
      memory.focusCollapsed,
    ]);
    if (sig === this.barSig) return;
    this.barSig = sig;

    const lead = createDiv();
    buildModeSwitch(lead, TODOS_MODES, "kanban", (mode) => {
      if (mode === "list") this.toList();
    });
    buildViewBar(this.barEl, {
      app: this.app,
      todos,
      lead: lead.firstElementChild as HTMLElement,
      // This view IS the board; picking List hands off to the list view.
      layout: { key: "kanban", label: "Kanban" },
      focus: {
        current: focus,
        onPick: (next) => {
          this.plugin.settings.focus = next;
          void this.plugin.saveSettings();
          this.barSig = null;
          this.renderViewBar();
          this.surface?.invalidate();
          this.renderContent();
        },
      },
      filters: {
        state: this.filterState,
        surface: "projects",
        onChange: () => {
          this.plugin.rememberView(MEMORY_KEY, { filters: this.filterState });
          this.barSig = null;
          this.renderViewBar();
          this.renderContent();
        },
      },
      collapsed: memory.focusCollapsed,
      onToggleCollapsed: (collapsed) => {
        this.plugin.rememberView(MEMORY_KEY, { focusCollapsed: collapsed });
        this.barSig = null;
        this.renderViewBar();
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
    const todos = filterByState(this.plugin.index.getAll(), this.filterState, "projects");
    this.surface.render(todos, "kanban");
  }

  /** The todo editor, preset to a column's status and the filtered project. */
  private addTodo(status?: Status, anchor?: ModalAnchor): void {
    const { app } = this.plugin;
    openCaptureEditor(this.plugin, {
      status,
      projectPath: projectPathByName(app, this.filterState.project),
      anchor,
    });
  }
}
