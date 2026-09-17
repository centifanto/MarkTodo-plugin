/**
 * The dashboard's list column — Notebook Navigator's list pane, for
 * todos. It draws whatever the navigation column selected: Inbox, Today, Todos,
 * or one project.
 *
 * In older versions each of those was its own tab (InboxView, TodayView, and the
 * List mode of TodosView / ProjectView). Their drawing moved here unchanged in
 * substance — the same pure builders (`inboxLogic`, `smartViews`,
 * `buildStatusSections`), the same Svelte list, the same render signatures —
 * and gained what a column needs: a header with the actions, and a back button
 * in one-column mode. It also shows the dashboard's SEARCH
 * results while the navigation column's search box has a query.
 *
 * Boards and notes still open as tabs in the main area (the header's board and
 * note buttons); a todo still opens the todo editor.
 */
import { Menu, setIcon } from "obsidian";
import { mount, unmount, type ComponentProps } from "svelte";
import TodoList from "../../ui/TodoList.svelte";
import { type Status, type TodoRecord } from "../../core/types";
import { localIsoDate } from "../../core/dates";
import { type Selection, sameSelection, searchTodos } from "../../ui/dashboardNav";
import { PRIORITY_LABEL, PROJECT_ICON } from "../../ui/iconMaps";
import { groupsSignature } from "../../ui/viewSignature";
import {
  DEFAULT_TODAY_ARRANGEMENT,
  EMPTY_MESSAGES,
  SMART_VIEWS,
  TODAY_GROUPS,
  TODAY_SORTS,
  arrangeSmartTodos,
  smartViewCounts,
  smartViewTodos,
  type SmartViewType,
  type TodayArrangement,
} from "../../ui/smartViews";
import { buildInboxSections } from "../inboxLogic";
import { buildListGroups } from "../viewData";
import {
  buildFilterBar,
  filterByState,
  filterOptionsSignature,
  isFilterActive,
  type FilterState,
  type FilterSurface,
} from "../filterBar";
import { openTodoMenu, revealTodo } from "../todoMenu";
import { openTodoModal } from "../todoModal";
import { openCaptureEditor } from "../quickAdd";
import { projectPathByName } from "../projects";
import { openBoard, openNote } from "../layout";
import { TodoSurface } from "./todoSurface";
import type MarkTodoPlugin from "../../../main";

export interface ListPaneHost {
  plugin: MarkTodoPlugin;
  /** One-column mode's way back to the navigation column. */
  onBack: () => void;
}

interface HeaderAction {
  icon: string;
  label: string;
  onClick: (evt: MouseEvent) => void;
  active?: boolean;
  badge?: number;
}

export class ListPane {
  private selection: Selection;
  private headerEl: HTMLElement;
  private barEl: HTMLElement;
  private segmentsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private components: Array<ReturnType<typeof mount>> = [];
  private surface: TodoSurface | null = null;
  private signature: string | null = null;
  private barSig: string | null = null;
  /** The navigation column's search query; while non-empty this column shows results. */
  private query = "";
  private segment: SmartViewType = "today";
  private filterState: FilterState = {};
  private backVisible = false;

  constructor(
    private host: ListPaneHost,
    private el: HTMLElement,
    selection: Selection,
  ) {
    this.selection = selection;
    el.addClass("marktodo-list-pane");
    this.headerEl = el.createDiv({ cls: "marktodo-pane-header" });
    const scroller = el.createDiv({ cls: "marktodo-list-scroll" });
    this.segmentsEl = scroller.createDiv({ cls: "marktodo-segments" });
    this.barEl = scroller.createDiv({ cls: "marktodo-list-filters" });
    this.bodyEl = scroller.createDiv({ cls: "marktodo-list-body marktodo-view" });
    this.show(selection, true);
  }

  private get plugin(): MarkTodoPlugin {
    return this.host.plugin;
  }

  /** Show a selection (ending any search). The same one again only refreshes. */
  show(selection: Selection, force = false): void {
    const searching = this.searching();
    this.query = "";
    if (!force && !searching && sameSelection(selection, this.selection)) {
      this.refresh();
      return;
    }
    this.selection = selection;
    this.segment = "today";
    this.teardownBody();
    this.filterState = this.memoryKey() ? this.plugin.viewMemory(this.memoryKey()!).filters : {};
    this.barSig = null;
    this.renderHeader();
    this.refresh();
    this.el.scrollTop = 0;
  }

  /** Search the vault (a query) or go back to the selection (empty). */
  setSearch(query: string): void {
    const was = this.searching();
    this.query = query;
    if (was !== this.searching()) {
      this.teardownBody();
      this.barSig = null;
      this.renderHeader();
    }
    this.refresh(true);
  }

  private searching(): boolean {
    return this.query.trim() !== "";
  }

  /** One-column mode shows a back button; two columns don't need one. */
  setBackVisible(visible: boolean): void {
    if (visible === this.backVisible) return;
    this.backVisible = visible;
    this.renderHeader();
  }

  /** Redraw for an index change — a no-op when nothing shown would change, unless `force`d. */
  refresh(force = false): void {
    if (force) {
      this.signature = null;
      this.surface?.invalidate();
    }
    if (this.searching()) return this.renderSearch();
    this.renderFilterBar();
    switch (this.selection.kind) {
      case "inbox":
        return this.renderInbox();
      case "today":
        return this.renderToday();
      case "todos":
        return this.renderSurface(filterByState(this.plugin.index.getAll(), this.filterState, "projects"), true);
      case "project":
        return this.renderSurface(this.plugin.index.getByFile(this.selection.path), false);
    }
  }

  destroy(): void {
    this.teardownBody();
  }

  // ── header ────────────────────────────────────────────────────────────────

  private renderHeader(): void {
    const h = this.headerEl;
    h.empty();
    if (this.backVisible) {
      const back = h.createDiv({ cls: "marktodo-pane-button marktodo-back", attr: { role: "button", "aria-label": "Back" } });
      setIcon(back, "chevron-left");
      back.addEventListener("click", () => this.host.onBack());
    }
    const title = h.createDiv({ cls: "marktodo-pane-title" });
    const { icon, label } = this.titleOf();
    setIcon(title.createSpan({ cls: "marktodo-pane-title-icon" }), icon);
    title.createSpan({ cls: "marktodo-pane-title-text", text: label });
    const actions = h.createDiv({ cls: "marktodo-pane-actions" });
    for (const action of this.actions()) {
      const b = actions.createDiv({
        cls: `marktodo-pane-button${action.active ? " is-active" : ""}`,
        attr: { role: "button", "aria-label": action.label },
      });
      setIcon(b, action.icon);
      if (action.badge) b.createSpan({ cls: "marktodo-pane-badge", text: String(action.badge) });
      b.addEventListener("click", (evt) => action.onClick(evt));
    }
  }

  private titleOf(): { icon: string; label: string } {
    if (this.searching()) return { icon: "search", label: "Search" };
    switch (this.selection.kind) {
      case "inbox":
        return { icon: "inbox", label: "Inbox" };
      case "today":
        return { icon: "calendar-days", label: "Today" };
      case "todos":
        return { icon: "list-todo", label: "Todos" };
      case "project": {
        const name = (this.selection.path.split("/").pop() ?? this.selection.path).replace(/\.md$/i, "");
        return { icon: PROJECT_ICON, label: name };
      }
    }
  }

  private actions(): HeaderAction[] {
    const sel = this.selection;
    const out: HeaderAction[] = [];
    if (this.searching()) return out;
    const key = this.memoryKey();
    if (key) {
      const open = !this.plugin.viewMemory(key).collapsed;
      const n = isFilterActive(this.filterState) ? Object.values(this.filterState).filter((v) => v !== undefined).length : 0;
      out.push({ icon: "list-filter", label: "Filters", active: open, badge: n, onClick: () => this.toggleFilters() });
    }
    if (sel.kind === "today") {
      out.push({ icon: "arrow-up-down", label: "Sort and group", onClick: (evt) => this.arrangeMenu(evt) });
    }
    if (sel.kind === "todos") {
      out.push({ icon: "columns-3", label: "Open as a Kanban board", onClick: () => void openBoard(this.plugin, { kind: "todos" }) });
    }
    if (sel.kind === "project") {
      const path = sel.path;
      out.push({
        icon: "columns-3",
        label: "Open as a Kanban board",
        onClick: () => void openBoard(this.plugin, { kind: "project", path, mode: "kanban" }),
      });
      out.push({ icon: "file-text", label: "Open the note", onClick: () => void openNote(this.plugin, path) });
    }
    out.push({ icon: "plus", label: "Add todo", onClick: () => this.addTodo() });
    return out;
  }

  // ── filters (Inbox and Todos) ────────────────────────────────────────────────

  private memoryKey(): string | null {
    return this.selection.kind === "inbox" ? "inbox" : this.selection.kind === "todos" ? "todos" : null;
  }

  private surfaceOf(): FilterSurface {
    return this.selection.kind === "inbox" ? "loose" : "projects";
  }

  private toggleFilters(): void {
    const key = this.memoryKey();
    if (!key) return;
    this.plugin.rememberView(key, { collapsed: !this.plugin.viewMemory(key).collapsed });
    this.barSig = null;
    this.renderHeader();
    this.renderFilterBar();
  }

  /** The filter bar, rebuilt only when its options change (so an open picker survives an index update). */
  private renderFilterBar(): void {
    const key = this.memoryKey();
    if (!key || this.plugin.viewMemory(key).collapsed) {
      this.barEl.empty();
      this.barSig = null;
      return;
    }
    const surface = this.surfaceOf();
    const all = this.plugin.index.getAll();
    const todos = surface === "loose" ? all.filter((t) => t.project === null) : all;
    const sig = JSON.stringify([key, filterOptionsSignature(todos)]);
    if (sig === this.barSig) return;
    this.barSig = sig;
    this.barEl.empty();
    buildFilterBar(this.barEl, {
      app: this.plugin.app,
      todos,
      state: this.filterState,
      surface,
      collapsed: false,
      onChange: () => {
        this.plugin.rememberView(key, { filters: this.filterState });
        this.renderHeader();
        this.refresh();
      },
    });
  }

  // ── bodies ────────────────────────────────────────────────────────────────

  private teardownBody(): void {
    for (const c of this.components) void unmount(c);
    this.components = [];
    this.surface?.destroy();
    this.surface = null;
    this.signature = null;
    this.bodyEl.empty();
    this.segmentsEl.empty();
    this.barEl.empty();
  }

  /** Todos and a project: every status section, via the shared surface. */
  private renderSurface(todos: readonly TodoRecord[], showProject: boolean): void {
    if (!this.surface) {
      this.bodyEl.empty();
      const project = this.selection.kind === "project" ? this.selection.path : undefined;
      this.surface = new TodoSurface({
        plugin: this.plugin,
        el: this.bodyEl.createDiv({ cls: "marktodo-surface" }),
        emptyText: () =>
          isFilterActive(this.filterState)
              ? "No todos match the current filters."
              : project
                ? "No todos in this project yet. Add one with +."
                : "No project todos yet. Add one with +.",
        onAdd: (status) => this.addTodo(status),
        showProject,
        memoryKey: project ? "project" : "todos",
      });
    }
    this.surface.render([...todos], "list");
  }

  private listProps(): Pick<ComponentProps<typeof TodoList>, "onStatusClick" | "onOpenTodo" | "onReveal"> {
    return {
      onStatusClick: (todo: TodoRecord, event: MouseEvent) => openTodoMenu(this.plugin, todo, event),
      onOpenTodo: (todo: TodoRecord, anchor?: Element) => openTodoModal(this.plugin, todo, anchor),
      onReveal: (todo: TodoRecord) => void revealTodo(this.plugin, todo),
    };
  }

  private remount(signature: string, draw: () => void): void {
    if (signature === this.signature) return;
    this.signature = signature;
    for (const c of this.components) void unmount(c);
    this.components = [];
    this.bodyEl.empty();
    draw();
  }

  /** Search results: every matching todo in the vault, grouped by note. */
  private renderSearch(): void {
    const results = searchTodos(this.plugin.index.getAll(), this.query);
    const groups = buildListGroups(results, "note");
    const signature = JSON.stringify(["search", this.query, groupsSignature(groups)]);
    this.remount(signature, () => {
      this.bodyEl.createDiv({
        cls: "marktodo-list-section-title",
        text: results.length === 1 ? "1 todo" : `${results.length} todos`,
      });
      this.components.push(
        mount(TodoList, {
          target: this.bodyEl,
          props: {
            ...this.listProps(),
            groups,
            total: results.length,
            emptyText: "No todos match.",
            showProject: false,
            onOpenNote: (path: string) => void openNote(this.plugin, path),
            dragDisabled: true,
          },
        }),
      );
    });
  }

  /** Inbox: loose todos by note, then unmanaged checkboxes with Convert. */
  private renderInbox(): void {
    const { settings } = this.plugin;
    const filtered = filterByState(this.plugin.index.getAll(), this.filterState, "loose");
    const sections = buildInboxSections(filtered, { showUnmanaged: settings.inboxShowUnmanaged });
    const signature = JSON.stringify(["inbox", groupsSignature([...sections.loose, ...sections.unmanaged])]);
    this.remount(signature, () => {
      if (sections.looseCount + sections.unmanagedCount === 0) {
        this.bodyEl.createDiv({
          cls: "marktodo-empty",
          text:
            isFilterActive(this.filterState)
              ? "No todos outside projects match."
              : "Inbox zero — every open todo is in a project.",
        });
        return;
      }
      const common = { ...this.listProps(), onOpenNote: (path: string) => void openNote(this.plugin, path) };
      this.section("Loose todos", sections.looseCount, { ...common, groups: sections.loose, total: sections.looseCount });
      if (settings.inboxShowUnmanaged && sections.unmanagedCount > 0) {
        this.section("Unmanaged", sections.unmanagedCount, {
          ...common,
          groups: sections.unmanaged,
          total: sections.unmanagedCount,
          onConvert: (todo: TodoRecord) => void this.plugin.writer.adopt(todo),
        });
      }
    });
  }

  private section(title: string, count: number, props: ComponentProps<typeof TodoList>): void {
    const el = this.bodyEl.createDiv({ cls: "marktodo-list-section" });
    const head = el.createDiv({ cls: "marktodo-list-section-title" });
    head.createSpan({ text: title });
    head.createSpan({ cls: "marktodo-group-count", text: String(count) });
    this.components.push(mount(TodoList, { target: el.createDiv(), props }));
  }

  /** Today: the four segments, then the arranged list. */
  private renderToday(): void {
    const today = localIsoDate(new Date());
    const all = this.plugin.index.getAll();
    this.renderSegments(smartViewCounts(all, today));
    const todos = smartViewTodos(all, this.segment, today);
    const arrangement = this.arrangement;
    const sections = arrangeSmartTodos(todos, this.segment, arrangement, {
      today,
      priorityLabels: PRIORITY_LABEL,
    });
    const signature = JSON.stringify([
      "today",
      this.segment,
      arrangement,
      sections.map((s) => [s.title, s.todos.map((t) => [t.id ?? `${t.file}:${t.line}`, t.glyph, t.displayText, t.project, t.note])]),
    ]);
    this.remount(signature, () => {
      this.components.push(
        mount(TodoList, {
          target: this.bodyEl,
          props: {
            ...this.listProps(),
            groups: sections.map((s) => ({ label: s.title, todos: s.todos })),
            total: todos.length,
            emptyText: EMPTY_MESSAGES[this.segment],
            showProject: true,
            // Dates and priorities are not places — no drag here.
            dragDisabled: true,
          },
        }),
      );
    });
  }

  private renderSegments(counts: Record<SmartViewType, number>): void {
    this.segmentsEl.empty();
    for (const { key, label } of SMART_VIEWS) {
      const el = this.segmentsEl.createDiv({ cls: `marktodo-segment${key === this.segment ? " is-active" : ""}` });
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(key === this.segment));
      el.createSpan({ text: label });
      if (counts[key] > 0) el.createSpan({ cls: "marktodo-segment-count", text: String(counts[key]) });
      el.addEventListener("click", () => {
        this.segment = key;
        this.refresh();
      });
    }
  }

  private get arrangement(): TodayArrangement {
    return { ...DEFAULT_TODAY_ARRANGEMENT, ...this.plugin.settings.todayArrangement };
  }

  /** Sort and group, as one menu — Notebook Navigator's sort button. */
  private arrangeMenu(evt: MouseEvent): void {
    const menu = new Menu();
    const { sort, group } = this.arrangement;
    const set = (patch: Partial<TodayArrangement>): void => {
      this.plugin.settings.todayArrangement = { ...this.arrangement, ...patch };
      void this.plugin.saveSettings();
      this.refresh();
    };
    menu.addItem((item) => item.setTitle("Sort by").setIsLabel(true));
    for (const option of TODAY_SORTS) {
      menu.addItem((item) =>
        item
          .setTitle(option.label)
          .setChecked(sort === option.key)
          .onClick(() => set({ sort: option.key })),
      );
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Group by").setIsLabel(true));
    for (const option of TODAY_GROUPS) {
      menu.addItem((item) =>
        item
          .setTitle(option.label)
          .setChecked(group === option.key)
          .onClick(() => set({ group: option.key })),
      );
    }
    menu.showAtMouseEvent(evt);
  }

  /** The todo editor, preset to what is on screen: the project, or the filtered one. */
  private addTodo(status?: Status): void {
    const { app } = this.plugin;
    const projectPath =
      this.selection.kind === "project"
        ? this.selection.path
        : this.selection.kind === "todos"
          ? projectPathByName(app, this.filterState.project)
          : undefined;
    openCaptureEditor(this.plugin, { status, projectPath });
  }
}
