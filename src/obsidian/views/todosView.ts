/**
 * The Todos board — every project todo as a Kanban board, in a tab in
 * the main area. Todos as a LIST lives in the dashboard's list column now; this
 * tab's List switch goes back there and closes the board.
 */
import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { type Status } from "../../core/types";
import { VIEW_TYPES } from "../../ui/paneLayout";
import {
  buildFilterBar,
  filterByState,
  filterOptionsSignature,
  type FilterState,
} from "../filterBar";
import { openCaptureEditor } from "../quickAdd";
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
    this.addAction("plus", "Add todo", () => this.addTodo());
    this.contentEl.empty();
    this.contentEl.addClass("marktodo-view", "marktodo-surface-view", "is-kanban");
    this.barEl = this.contentEl.createDiv();
    this.surface = new TodoSurface({
      plugin: this.plugin,
      el: this.contentEl.createDiv({ cls: "marktodo-surface" }),
      emptyText: () => "",
      onAdd: (status) => this.addTodo(status),
      showProject: true,
      memoryKey: MEMORY_KEY,
    });
    this.renderFilterBar();
    this.renderContent();
    // An index change can add or rename projects → the bar's options too.
    this.unsubscribe = this.plugin.index.onChange(() => {
      this.renderFilterBar();
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
   * (Re)build the filter bar only when its option set changed, so an index
   * update never tears down a picker you have open. The mode switch rides in
   * its head row and is rebuilt with it.
   */
  private renderFilterBar(): void {
    if (!this.barEl) return;
    const todos = this.plugin.index.getAll();
    const sig = filterOptionsSignature(todos);
    if (sig === this.barSig) return;
    this.barSig = sig;
    this.barEl.empty();
    const lead = createDiv();
    buildModeSwitch(lead, TODOS_MODES, "kanban", (mode) => {
      if (mode === "list") this.toList();
    });
    buildFilterBar(this.barEl, {
      app: this.app,
      todos,
      state: this.filterState,
      surface: "projects",
      collapsed: this.plugin.viewMemory(MEMORY_KEY).collapsed,
      lead: lead.firstElementChild as HTMLElement,
      onChange: () => {
        this.renderContent();
        this.plugin.rememberView(MEMORY_KEY, { filters: this.filterState });
      },
      onToggleCollapsed: (collapsed) => this.plugin.rememberView(MEMORY_KEY, { collapsed }),
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
  private addTodo(status?: Status): void {
    const { app } = this.plugin;
    openCaptureEditor(this.plugin, {
      status,
      projectPath: projectPathByName(app, this.filterState.project),
    });
  }
}
