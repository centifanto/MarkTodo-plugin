/**
 * The dashboard's list column — Notebook Navigator's list pane, for
 * todos. It draws whatever the navigation column selected: Inbox, Agenda, Todos,
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
import { Notice, setIcon } from "obsidian";
import { mount, unmount, type ComponentProps } from "svelte";
import TodoList from "../../ui/TodoList.svelte";
import { type Status, type TodoRecord } from "../../core/types";
import { localIsoDate } from "../../core/dates";
import { type Selection, sameSelection, searchTodos } from "../../ui/dashboardNav";
import { PRIORITY_LABEL, PROJECT_ICON } from "../../ui/iconMaps";
import { groupsSignature } from "../../ui/viewSignature";
import {
  EMPTY_MESSAGES,
  SMART_VIEWS,
  AGENDA_GROUPS,
  arrangeSmartTodos,
  smartViewCounts,
  smartViewTodos,
  type SmartViewType,
  type AgendaArrangement,
} from "../../ui/smartViews";
import { buildInboxSections } from "../inboxLogic";
import { type ModalAnchor } from "../modalAnchor";
import { focusCounts, focusLabel, type Focus } from "../../ui/focus";
import { type SortKey } from "../../ui/sorts";
import { AGENDA_COLLAPSED_STATUSES } from "../../ui/statusSections";
import { buildListGroups } from "../viewData";
import { buildViewBar } from "../viewBar";
import { GROUP_ICONS, SMART_VIEW_ICONS, withIcons } from "../viewIcons";
import {
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
}

export class ListPane {
  private selection: Selection;
  private headerEl: HTMLElement;
  private barEl: HTMLElement;
  private segmentsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private components: Array<ReturnType<typeof mount>> = [];
  private surface: TodoSurface | null = null;
  /** See `capProps` — reset by `teardownBody` and by switching segment. */
  private caps: Record<string, number> = {};
  private signature: string | null = null;
  private barSig: string | null = null;
  /** The navigation column's search query; while non-empty this column shows results. */
  private query = "";
  private segment: SmartViewType = "agenda";
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
    this.barEl = scroller.createDiv({ cls: "marktodo-list-bar" });
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
    this.segment = "agenda";
    this.teardownBody();
    const key = this.memoryKey();
    this.filterState = key !== null && this.hasFilters() ? this.plugin.viewMemory(key).filters : {};
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
    this.renderViewBar();
    switch (this.selection.kind) {
      case "inbox":
        return this.renderInbox();
      case "agenda":
        return this.renderAgenda();
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
        cls: "marktodo-pane-button",
        attr: { role: "button", "aria-label": action.label },
      });
      setIcon(b, action.icon);
      b.addEventListener("click", (evt) => action.onClick(evt));
    }
  }

  private titleOf(): { icon: string; label: string } {
    if (this.searching()) return { icon: "search", label: "Search" };
    switch (this.selection.kind) {
      case "inbox":
        return { icon: "inbox", label: "Inbox" };
      case "agenda":
        return { icon: "calendar-days", label: "Agenda" };
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
    // No Filters and no Sort button: the view bar below carries all of it —
    // its summary line says the focus, the filter count, the sort and the
    // grouping even while collapsed, and its chevron opens the controls.
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
    out.push({ icon: "plus", label: "Add todo", onClick: (evt) => this.addTodo(undefined, evt) });
    return out;
  }

  // ── the view bar (focus · filters · sort) ────────────────────────────────

  /**
   * Which `ViewMemory` entry this selection's bar state lives under. Agenda's is
   * per segment; its sort and group come from `settings.agendaArrangement`
   * instead, because the companion app reads those too.
   */
  private memoryKey(): string | null {
    switch (this.selection.kind) {
      case "inbox":
        return "inbox";
      case "todos":
        return "todos";
      case "project":
        return "project";
      case "agenda":
        // Per SEGMENT: the four are four different questions, so each remembers
        // its own filters, its folds and its collapse. Its sort and group live
        // in `settings.agendaArrangement`, which the companion app reads too.
        return `agenda:${this.segment}`;
    }
  }

  /**
   * Every surface offers filters. A project's own list used to be excluded
   * because "it is already one project" — but that rules out only the PROJECT
   * picker; tag, priority and managed all still narrow a long project usefully,
   * and the companion app offers them there, so a vault and a phone showing the
   * same project disagreed about what you could do to it.
   */
  private hasFilters(): boolean {
    return true;
  }

  /**
   * Focus and sort go together: both belong to the status-sectioned lists. The
   * Inbox has neither — a loose todo can only be Backlog or Done, so Plan /
   * Active / Doing would be three controls two of which can never match, and its
   * sections are notes rather than statuses.
   */
  private hasStatusSections(): boolean {
    return this.selection.kind === "todos" || this.selection.kind === "project";
  }

  private surfaceOf(): FilterSurface {
    if (this.selection.kind === "inbox") return "loose";
    // Agenda is every todo with a date on it, filed or loose, so it filters over both.
    if (this.selection.kind === "agenda") return "any";
    return "projects";
  }

  /** The todos this surface works on, filtered — what the focus counts count. */
  private surfaceTodos(): readonly TodoRecord[] {
    return this.selection.kind === "project"
      ? this.plugin.index.getByFile(this.selection.path)
      : filterByState(this.plugin.index.getAll(), this.filterState, this.surfaceOf());
  }

  /**
   * The view bar, rebuilt only when what it DRAWS changes — its options, its
   * counts, the focus, the sort or its own collapse — so an unrelated index
   * update never tears down a picker you have open mid-type.
   */
  private renderViewBar(): void {
    const key = this.memoryKey();
    if (key === null) {
      this.barEl.empty();
      this.barSig = null;
      return;
    }
    const agenda = this.selection.kind === "agenda";
    const memory = this.plugin.viewMemory(key);
    const focus = this.plugin.settings.focus;
    const all = this.plugin.index.getAll();
    const options = this.surfaceOf() === "loose" ? all.filter((t) => t.project === null) : all;
    const todos = this.surfaceTodos();
    // Agenda sorts and groups per segment out of settings; every other surface
    // sorts out of its own view memory and doesn't group at all.
    const arrangement = agenda ? this.arrangement : null;
    const sig = JSON.stringify([
      key,
      memory.focusCollapsed,
      memory.sort,
      arrangement,
      focus,
      this.hasStatusSections() ? focusCounts(todos) : null,
      [filterOptionsSignature(options), this.filterState],
    ]);
    if (sig === this.barSig) return;
    this.barSig = sig;

    buildViewBar(this.barEl, {
      app: this.plugin.app,
      todos,
      // Only the surfaces with a board to switch to name a layout.
      layout: this.hasStatusSections() ? { key: "list", label: "List" } : undefined,
      focus: this.hasStatusSections()
        ? { current: focus, onPick: (next) => this.setFocus(next) }
        : undefined,
      filters: {
        state: this.filterState,
        surface: this.surfaceOf(),
        onChange: () => {
          this.plugin.rememberView(key, { filters: this.filterState });
          this.barSig = null;
          this.refresh();
        },
      },
      sort: arrangement
        ? {
            current: arrangement.sort,
            surface: "agenda",
            spansProjects: true,
            onPick: (sort) => this.setArrangement({ sort }),
          }
        : this.hasStatusSections()
          ? {
              current: memory.sort,
              surface: "list",
              // Only Todos spans projects; a project's own list orders nothing by it.
              spansProjects: this.selection.kind === "todos",
              onPick: (sort) => this.setSort(key, sort),
            }
          : undefined,
      group: arrangement
        ? {
            current: arrangement.group,
            options: withIcons(AGENDA_GROUPS, GROUP_ICONS),
            onPick: (group) => this.setArrangement({ group: group as AgendaArrangement["group"] }),
          }
        : undefined,
      collapsed: memory.focusCollapsed,
      onToggleCollapsed: (collapsed) => {
        this.plugin.rememberView(key, { focusCollapsed: collapsed });
        this.barSig = null;
        this.renderViewBar();
      },
    });
  }

  /** Write one of Agenda's per-segment arrangement fields and redraw. */
  private setArrangement(patch: Partial<AgendaArrangement>): void {
    this.plugin.settings.agendaArrangement = {
      ...this.plugin.settings.agendaArrangement,
      [this.segment]: { ...this.arrangement, ...patch },
    };
    void this.plugin.saveSettings();
    this.barSig = null;
    this.refresh(true);
  }

  private setFocus(focus: Focus): void {
    this.plugin.settings.focus = focus;
    void this.plugin.saveSettings();
    this.barSig = null;
    this.refresh(true);
  }

  private setSort(key: string, sort: SortKey): void {
    this.plugin.rememberView(key, { sort });
    this.barSig = null;
    this.refresh(true);
  }

  // ── bodies ────────────────────────────────────────────────────────────────

  private teardownBody(): void {
    // The body is being rebuilt for a DIFFERENT thing (a new selection, or
    // search opening or closing) — which is exactly when the caps reset.
    this.caps = {};
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
        emptyText: () => {
          // Focus first: it is the narrowing the user most recently chose, and
          // "nothing here" reads as wrong when three whole sections are hidden.
          const focus = this.plugin.settings.focus;
          if (focus !== "all") {
            return `Nothing in ${focusLabel(focus)}. Switch to All above to see the rest.`;
          }
          if (isFilterActive(this.filterState)) return "No todos match the current filters.";
          return project
            ? "No todos in this project yet. Add one with +."
            : "No project todos yet. Add one with +.";
        },
        onAdd: (status, anchor) => this.addTodo(status, anchor),
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

  /**
   * Sections opened past the row cap, for the lists this pane mounts itself
   * (the Agenda segments, the Inbox's). Cleared whenever the body is torn down
   * for something else, so every arrival starts back at the cap — see the note
   * on `TodoSurface.caps`, which does the same for the surface's lists.
   */
  private capProps(): Pick<ComponentProps<typeof TodoList>, "shown" | "onShowMore"> {
    return {
      shown: this.caps,
      onShowMore: (shown: Record<string, number>) => {
        this.caps = shown;
      },
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
      const common = {
        ...this.listProps(),
        ...this.capProps(),
        onOpenNote: (path: string) => void openNote(this.plugin, path),
      };
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

  /** Agenda: the four segments, then the arranged list. */
  private renderAgenda(): void {
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
      "agenda",
      this.segment,
      arrangement,
      sections.map((s) => [s.key, s.title, s.todos.map((t) => [t.id ?? `${t.file}:${t.line}`, t.glyph, t.displayText, t.project, t.note])]),
    ]);
    // Pull forward only where the band is a band: on Reminders a passed
    // reminder groups under "Overdue" too, and re-dating one would move a due
    // date nobody asked about.
    const banded = this.segment === "agenda" || this.segment === "upcoming";
    // Folds are per segment and persisted: Agenda opens on Doing alone, and any
    // section you open or close stays that way across restarts.
    const memoryKey = this.memoryKey() ?? "agenda";
    const folds = this.plugin.viewMemory(memoryKey).sections;
    this.remount(signature, () => {
      this.components.push(
        mount(TodoList, {
          target: this.bodyEl,
          props: {
            ...this.listProps(),
            groups: sections.map((s) => ({
              key: s.key,
              label: s.title,
              todos: s.todos,
              status: s.status,
            })),
            total: todos.length,
            emptyText: EMPTY_MESSAGES[this.segment],
            showProject: true,
            collapsed: folds,
            collapsedDefaults: AGENDA_COLLAPSED_STATUSES,
            onToggleSection: (sections: string[]) =>
              this.plugin.rememberView(memoryKey, { sections }),
            ...this.capProps(),
            // Dates and priorities are not places — no drag here.
            dragDisabled: true,
            onPullForward: banded
              ? (overdue: TodoRecord[]) => void this.pullForward(overdue)
              : undefined,
          },
        }),
      );
    });
  }

  /**
   * "Pull forward": the overdue todos ON SCREEN become due today.
   *
   * Scoped to the rows the band is drawing — what filter and focus have already
   * narrowed to — never every overdue todo in the vault. A button that quietly
   * reaches past what you can see is one you can't trust; this one can only
   * touch what it is sitting on top of.
   *
   * No confirmation: it is one ordinary re-date per row, each visible in its own
   * note and each undoable by editing the todo, which is a smaller step than the
   * dialog asking about it would be.
   */
  private async pullForward(todos: readonly TodoRecord[]): Promise<void> {
    const today = localIsoDate(new Date());
    const moved = await this.plugin.writer.pullForward(todos, today);
    new Notice(
      moved === 0
        ? "MarkTodo: nothing to pull forward."
        : `MarkTodo: pulled ${moved} todo${moved === 1 ? "" : "s"} forward to today.`,
    );
    this.refresh(true);
  }

  private renderSegments(counts: Record<SmartViewType, number>): void {
    this.segmentsEl.empty();
    for (const { key, label } of SMART_VIEWS) {
      const el = this.segmentsEl.createDiv({ cls: `marktodo-segment${key === this.segment ? " is-active" : ""}` });
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(key === this.segment));
      setIcon(el.createSpan({ cls: "marktodo-segment-icon" }), SMART_VIEW_ICONS[key]);
      el.createSpan({ text: label });
      if (counts[key] > 0) el.createSpan({ cls: "marktodo-segment-count", text: String(counts[key]) });
      el.addEventListener("click", () => {
        // Another segment is another list: back to the cap.
        this.caps = {};
        this.segment = key;
        this.refresh();
      });
    }
  }

  /** This segment's own sort + group. Each of the four is remembered separately. */
  private get arrangement(): AgendaArrangement {
    return this.plugin.settings.agendaArrangement[this.segment];
  }


  /** The todo editor, preset to what is on screen: the project, or the filtered one. */
  private addTodo(status?: Status, anchor?: ModalAnchor): void {
    const { app } = this.plugin;
    const projectPath =
      this.selection.kind === "project"
        ? this.selection.path
        : this.selection.kind === "todos"
          ? projectPathByName(app, this.filterState.project)
          : undefined;
    openCaptureEditor(this.plugin, { status, projectPath, anchor });
  }
}
