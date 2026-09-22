/**
 * The MarkTodo dashboard, laid out like Notebook Navigator.
 *
 *   ┌ navigation ───────┬ list ──────────────────────┐
 *   │ + ⊕ ⇅ ▥          │ ☐ AGENDA         ⌕ ⇅ +     │
 *   │ Inbox          2  │ Agenda 2 · Upcoming · …    │
 *   │ Agenda         2  │ ☐ Test 10         ⇈        │
 *   │ Todos          8  │   Yesterday · Project 2    │
 *   │ ⌄ Projects        │ ─────────────────────────  │
 *   │   ⌄ Work          │ ☐ Test                     │
 *   │       Client      │                            │
 *   └───────────────────┴────────────────────────────┘
 *
 * Two columns side by side, with a draggable divider — the navigation on the
 * left or the right (`navSide`); one column shows the navigation OR
 * the list, the list with a back button. The search box lives in the navigation
 * column and searches the whole vault into the list column. A phone is always one
 * column, and so is a dashboard squeezed below `MIN_DUAL_WIDTH`. The list column
 * is `ListPane`; boards and notes open as tabs in the main area.
 *
 * All ordering, sectioning, collapse, counting and group editing is pure and
 * lives in `ui/projectNav.ts`; the selection and layout rules in
 * `ui/dashboardNav.ts`. This file is DOM + Obsidian glue.
 */
import { ItemView, Menu, Notice, Platform, TFile, debounce, setIcon, type WorkspaceLeaf } from "obsidian";
import { type TodoRecord } from "../../core/types";
import { LOGO_ICON } from "../../ui/logo";
import { PROJECT_ICON, PROJECTS_ICON } from "../../ui/iconMaps";
import { localIsoDate } from "../../core/dates";
import { smartViewCounts } from "../../ui/smartViews";
import {
  PROJECT_SORTS,
  arrangeProjects,
  existingGroups,
  isSectionOpen,
  looseOpenCount,
  projectCounts,
  renameSectionKey,
  sectionProjects,
  toggleSection,
  type NavProject,
  type ProjectSection,
} from "../../ui/projectNav";
import {
  clampNavWidth,
  effectivePaneMode,
  followRename,
  sameSelection,
  selectionToken,
  type PaneMode,
  type Selection,
} from "../../ui/dashboardNav";
import { ARCHIVED_FM_KEY, GROUP_FM_KEY } from "../../core/noteMeta";
import { getProjectFiles, noteMetaOf } from "../projects";
import { reconcileArchive } from "../archiveReconcile";
import { createProject } from "../createProject";
import { openCaptureEditor } from "../quickAdd";
import { type ModalAnchor } from "../modalAnchor";
import { type NavMemory } from "../settings";
import { GroupModal } from "../groupModal";
import { openNote, type DashboardHandle } from "../layout";
import { THEME_CLASS } from "../themeStyles";
import { ListPane } from "./listPane";
import type MarkTodoPlugin from "../../../main";

export const NAV_VIEW_TYPE = "marktodo-nav";

/** Collapse keys for the two top-level tree nodes (groups use their names). */
const PINNED_KEY = "\u0000pinned";
const PROJECTS_KEY = "\u0000projects";

export class NavView extends ItemView implements DashboardHandle {
  private unsubscribe?: () => void;
  /** What the last navigation build was made from; a matching signature skips a rebuild. */
  private signature: string | null = null;
  /** An index change arrived while hidden — rebuild when the dashboard is shown again. */
  private dirty = false;
  /** Rows that can be selected, by token, so a selection never rebuilds the tree. */
  private activatable: Array<[HTMLElement, string]> = [];
  private navEl!: HTMLElement;
  private navBodyEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private listEl!: HTMLElement;
  private list: ListPane | null = null;
  private mode: PaneMode = "dual";
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkTodoPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return NAV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "MarkTodo";
  }

  getIcon(): string {
    return LOGO_ICON;
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass(THEME_CLASS);
    this.contentEl.empty();
    this.contentEl.addClass("marktodo-dash");

    this.navEl = this.contentEl.createDiv({ cls: "marktodo-dash-nav" });
    this.renderNavHeader();
    this.buildSearch();
    this.navBodyEl = this.navEl.createDiv({ cls: "marktodo-nav" });
    const divider = this.contentEl.createDiv({ cls: "marktodo-dash-divider", attr: { "aria-hidden": "true" } });
    this.listEl = this.contentEl.createDiv({ cls: "marktodo-dash-list" });
    this.list = new ListPane({ plugin: this.plugin, onBack: () => this.showNav() }, this.listEl, this.plugin.settings.nav.selected);
    this.dragDivider(divider);

    this.applyLayout();
    this.renderNav();

    this.unsubscribe = this.plugin.index.onChange(() => {
      if (!this.containerEl.isShown()) {
        this.dirty = true;
        return;
      }
      this.renderNav();
      this.list?.refresh();
    });
    // The index only notifies for notes WITH todos, but the navigation draws
    // every project — an empty one grouped, archived or renamed changed nothing
    // the index knows about. Its frontmatter lands in the metadata cache.
    const soon = debounce(() => this.renderNav(), 120, true);
    this.registerEvent(this.app.metadataCache.on("changed", soon));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.follow(oldPath, file.path);
        soon();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.follow(file.path, null);
        soon();
      }),
    );
    // A dashboard behind a collapsed sidebar draws nothing; this is when it is back.
    this.registerEvent(this.app.workspace.on("layout-change", () => this.flush()));
    // Two columns become one when the dashboard is squeezed, and back.
    this.resizeObserver = new ResizeObserver(() => this.applyLayout());
    this.resizeObserver.observe(this.contentEl);
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.list?.destroy();
    this.list = null;
  }

  // ── selection and layout ──────────────────────────────────────────────────

  /** Show a selection in the list column (and, in one-column mode, switch to it). Ends a search. */
  select(selection: Selection): void {
    if (this.searchInput) this.searchInput.value = "";
    const nav = this.plugin.settings.nav;
    const changed = !sameSelection(nav.selected, selection) || nav.singleView !== "list";
    this.plugin.settings.nav = { ...nav, selected: selection, singleView: "list" };
    if (changed) void this.plugin.saveSettings();
    this.list?.show(selection);
    this.syncActive();
    this.applyLayout();
  }

  /** One-column mode's back button. */
  private showNav(): void {
    this.plugin.settings.nav = { ...this.plugin.settings.nav, singleView: "nav" };
    void this.plugin.saveSettings();
    this.applyLayout();
  }

  /** Re-read the layout settings and redraw (Settings calls this). */
  refreshLayout(): void {
    this.signature = null;
    this.applyLayout();
    this.renderNav();
    this.list?.refresh(true);
  }

  private applyLayout(): void {
    const width = this.contentEl.clientWidth;
    this.mode = effectivePaneMode(this.plugin.settings.paneMode, { phone: Platform.isPhone, width });
    const single = this.mode === "single";
    this.contentEl.toggleClass("is-nav-right", this.plugin.settings.navSide === "right");
    this.contentEl.toggleClass("is-dual", !single);
    this.contentEl.toggleClass("is-single", single);
    this.contentEl.toggleClass("is-showing-list", single && this.plugin.settings.nav.singleView === "list");
    this.navEl.setCssStyles({ width: single ? "" : `${clampNavWidth(this.plugin.settings.nav.navWidth, width || 1000)}px` });
    this.list?.setBackVisible(single);
    this.renderNavHeader();
  }

  /** The divider between the columns: drag to resize; the width is remembered. */
  private dragDivider(divider: HTMLElement): void {
    divider.addEventListener("pointerdown", (down) => {
      if (this.mode !== "dual") return;
      down.preventDefault();
      const startX = down.clientX;
      const startWidth = this.navEl.getBoundingClientRect().width;
      const total = this.contentEl.clientWidth;
      divider.setPointerCapture(down.pointerId);
      this.contentEl.addClass("is-resizing");
      // With the navigation on the right, dragging the divider left widens it.
      const sign = this.plugin.settings.navSide === "right" ? -1 : 1;
      const move = (evt: PointerEvent): void => {
        this.navEl.setCssStyles({ width: `${clampNavWidth(startWidth + sign * (evt.clientX - startX), total)}px` });
      };
      const up = (): void => {
        divider.removeEventListener("pointermove", move);
        divider.removeEventListener("pointerup", up);
        this.contentEl.removeClass("is-resizing");
        this.plugin.settings.nav = { ...this.plugin.settings.nav, navWidth: Math.round(this.navEl.getBoundingClientRect().width) };
        void this.plugin.saveSettings();
      };
      divider.addEventListener("pointermove", move);
      divider.addEventListener("pointerup", up);
    });
  }

  /** A renamed or deleted project note carries (or drops) the selection with it. */
  private follow(oldPath: string, newPath: string | null): void {
    const current = this.plugin.settings.nav.selected;
    const next = followRename(current, oldPath, newPath);
    if (next === current) return;
    this.plugin.settings.nav = { ...this.plugin.settings.nav, selected: next };
    void this.plugin.saveSettings();
    this.list?.show(next);
    this.syncActive();
  }

  // ── data ──────────────────────────────────────────────────────────────────

  /** Every project note as a navigation row, with its live counts attached. */
  private projects(todos: readonly TodoRecord[]): NavProject[] {
    const counts = projectCounts(todos, localIsoDate(new Date()));
    return getProjectFiles(this.app).map((file) => {
      const meta = noteMetaOf(this.app, file);
      const count = counts.get(file.basename);
      return {
        name: file.basename,
        path: file.path,
        group: meta.group,
        archived: meta.archived,
        pinned: meta.pinned,
        open: count?.open ?? 0,
        overdue: count?.overdue ?? 0,
        mtime: file.stat.mtime,
      };
    });
  }

  private saveNav(patch: Partial<NavMemory>): void {
    this.plugin.settings.nav = { ...this.plugin.settings.nav, ...patch };
    void this.plugin.saveSettings();
    this.renderNav();
  }

  /** Rebuild if an index change arrived while hidden. */
  private flush(): void {
    if (!this.dirty || !this.containerEl.isShown()) return;
    this.dirty = false;
    this.renderNav();
    this.list?.refresh();
  }

  /** Light the selected row. Keyed by token, so it costs one class toggle per row. */
  private syncActive(): void {
    const active = selectionToken(this.plugin.settings.nav.selected);
    for (const [el, token] of this.activatable) el.toggleClass("is-active", token === active);
  }

  // ── navigation column ─────────────────────────────────────────────────────

  /** The navigation column's toolbar — Notebook Navigator's row of icon buttons. */
  private renderNavHeader(): void {
    let header = this.navEl.querySelector<HTMLElement>(":scope > .marktodo-pane-header");
    if (!header) header = this.navEl.createDiv({ cls: "marktodo-pane-header" });
    else header.empty();
    const actions = header.createDiv({ cls: "marktodo-pane-actions is-start" });
    const button = (icon: string, label: string, onClick: (evt: MouseEvent) => void, active = false): void => {
      const b = actions.createDiv({
        cls: `marktodo-pane-button${active ? " is-active" : ""}`,
        attr: { role: "button", "aria-label": label },
      });
      setIcon(b, icon);
      b.addEventListener("click", onClick);
    };
    button("square-pen", "Add todo", (evt) => this.addTodo(evt));
    button("plus", "New project or group", (evt) => this.newMenu(evt, this.projects(this.plugin.index.getAll())));
    button("arrow-up-down", "Sort projects", (evt) => this.sortMenu(evt));
    button("chevrons-down-up", "Collapse or expand all groups", () => this.toggleAllGroups());
    if (!Platform.isPhone) {
      const dual = this.plugin.settings.paneMode === "dual";
      button("columns-2", dual ? "Show one column" : "Show two columns", () => this.toggleColumns(), dual);
    }
  }

  /**
   * The search box, under the navigation toolbar. It searches every todo in the
   * vault; the list column shows the results while there is a query, and the
   * selection again once it is cleared. In one column, Enter shows the results.
   */
  private buildSearch(): void {
    const box = this.navEl.createDiv({ cls: "marktodo-search" });
    setIcon(box.createSpan({ cls: "marktodo-search-icon" }), "search");
    this.searchInput = box.createEl("input", {
      cls: "marktodo-search-input",
      attr: { type: "search", placeholder: "Search todos…", "aria-label": "Search todos", spellcheck: "false" },
    });
    this.searchInput.addEventListener("input", () => {
      this.list?.setSearch(this.searchInput.value);
      // Two columns show results as you type; one column waits for Enter so the
      // box doesn't slide away mid-word.
    });
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.searchInput.value.trim() !== "") {
        e.preventDefault();
        this.plugin.settings.nav = { ...this.plugin.settings.nav, singleView: "list" };
        this.applyLayout();
      } else if (e.key === "Escape" && this.searchInput.value !== "") {
        e.preventDefault();
        this.searchInput.value = "";
        this.list?.setSearch("");
      }
    });
  }

  private toggleColumns(): void {
    this.plugin.settings.paneMode = this.plugin.settings.paneMode === "dual" ? "single" : "dual";
    void this.plugin.saveSettings();
    this.applyLayout();
  }

  /** Collapse every group if any is open; otherwise open them all. */
  private toggleAllGroups(): void {
    const projects = this.projects(this.plugin.index.getAll());
    const { sort, collapsed } = this.plugin.settings.nav;
    const sections = sectionProjects(arrangeProjects(projects, sort).rest, sort).filter(
      (s) => s.label !== null && !s.archived,
    );
    const anyOpen = sections.some((s) => isSectionOpen(s, collapsed));
    const keys = sections.map((s) => s.key);
    const next = anyOpen ? [...new Set([...collapsed, ...keys])] : collapsed.filter((k) => !keys.includes(k));
    this.saveNav({ collapsed: next });
  }

  private addTodo(anchor?: ModalAnchor): void {
    const selected = this.plugin.settings.nav.selected;
    openCaptureEditor(this.plugin, {
      projectPath: selected.kind === "project" ? selected.path : undefined,
      anchor,
    });
  }

  private renderNav(): void {
    if (!this.containerEl.isShown()) {
      this.dirty = true;
      return;
    }
    const { sort, collapsed } = this.plugin.settings.nav;
    const todos = this.plugin.index.getAll();
    const projects = this.projects(todos);
    const today = localIsoDate(new Date());
    const counts = smartViewCounts(todos, today);
    const inbox = looseOpenCount(todos, this.plugin.settings.inboxShowUnmanaged);
    const todosCount = projects.filter((p) => !p.archived).reduce((n, p) => n + p.open, 0);

    // Editing a todo's text re-indexes its file and notifies every subscriber,
    // but changes nothing this column draws — compare before touching the DOM.
    const signature = JSON.stringify([
      today,
      todosCount,
      sort,
      collapsed,
      inbox,
      counts.agenda,
      // Pinning is a per-project flag now, so it rides along in the per-project
      // row instead of being its own list — leave it out and a pin never paints.
      projects.map((p) => [p.name, p.path, p.group, p.pinned, p.archived, p.open, p.overdue]),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    const body = this.navBodyEl;
    const scroll = body.scrollTop;
    body.empty();
    this.activatable = [];

    this.row(body, { label: "Inbox", icon: "inbox", count: inbox, selection: { kind: "inbox" } });
    this.row(body, { label: "Agenda", icon: "calendar-days", count: counts.agenda, selection: { kind: "agenda" } });
    this.row(body, { label: "Todos", icon: "list-todo", count: todosCount, selection: { kind: "todos" } });

    const { pinned, rest } = arrangeProjects(projects, sort);
    if (pinned.length > 0) {
      const children = this.node(body, { key: PINNED_KEY, label: "Pinned", icon: "pin" });
      if (children) for (const project of pinned) this.projectRow(children, project, projects);
    }

    const projectsChildren = this.node(body, {
      key: PROJECTS_KEY,
      label: "Projects",
      icon: PROJECTS_ICON,
      count: projects.filter((p) => !p.archived).length,
    });
    if (projectsChildren) {
      if (projects.length === 0) {
        projectsChildren.createDiv({
          cls: "marktodo-nav-hint",
          text: "No projects yet. Use + above to make one — a note with every status heading.",
        });
      } else if (rest.length === 0) {
        projectsChildren.createDiv({ cls: "marktodo-nav-hint", text: "Every project is pinned." });
      }
      for (const section of sectionProjects(rest, sort)) {
        if (section.archived) continue;
        if (section.label === null) {
          for (const project of section.projects) this.projectRow(projectsChildren, project, projects);
          continue;
        }
        const groupChildren = this.groupNode(projectsChildren, section, projects);
        if (groupChildren) for (const project of section.projects) this.projectRow(groupChildren, project, projects);
      }
    }

    const archived = sectionProjects(rest, sort).find((s) => s.archived);
    if (archived) {
      const children = this.groupNode(body, archived, projects);
      if (children) for (const project of archived.projects) this.projectRow(children, project, projects);
    }

    this.syncActive();
    body.scrollTop = scroll;
  }

  // ── rows ──────────────────────────────────────────────────────────────────

  private row(
    parent: HTMLElement,
    opts: {
      label: string;
      icon: string;
      selection: Selection;
      count?: number;
      alert?: boolean;
      muted?: boolean;
      /** Right-click, and the "…" button that appears on hover — so the menu is findable. */
      onMenu?: (evt: MouseEvent) => void;
    },
  ): HTMLElement {
    const el = parent.createDiv({ cls: `marktodo-nav-row${opts.muted ? " is-muted" : ""}` });
    this.activatable.push([el, selectionToken(opts.selection)]);
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.createSpan({ cls: "marktodo-nav-chevron is-spacer" });
    setIcon(el.createSpan({ cls: "marktodo-nav-icon" }), opts.icon);
    el.createSpan({ cls: "marktodo-nav-label", text: opts.label });
    if (opts.alert) el.createSpan({ cls: "marktodo-nav-alert", attr: { "aria-label": "Something is overdue" } });
    if (opts.count) el.createSpan({ cls: "marktodo-nav-count", text: String(opts.count) });
    if (opts.onMenu) this.moreButton(el, `${opts.label} options`, opts.onMenu);
    const choose = (): void => this.select(opts.selection);
    el.addEventListener("click", choose);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose();
      }
    });
    if (opts.onMenu) el.addEventListener("contextmenu", opts.onMenu);
    return el;
  }

  /**
   * A collapsible tree node (Pinned, Projects): its row, and a children
   * container with a guide line — or null when it is collapsed.
   */
  private node(
    parent: HTMLElement,
    opts: { key: string; label: string; icon: string; count?: number; onMenu?: (evt: MouseEvent) => void },
  ): HTMLElement | null {
    const { collapsed } = this.plugin.settings.nav;
    const open = !collapsed.includes(opts.key);
    const el = parent.createDiv({ cls: "marktodo-nav-row is-node" });
    el.setAttribute("role", "button");
    el.setAttribute("aria-expanded", String(open));
    setIcon(el.createSpan({ cls: `marktodo-nav-chevron${open ? " is-open" : ""}` }), "chevron-right");
    setIcon(el.createSpan({ cls: "marktodo-nav-icon" }), opts.icon);
    el.createSpan({ cls: "marktodo-nav-label", text: opts.label });
    if (opts.count) el.createSpan({ cls: "marktodo-nav-count", text: String(opts.count) });
    if (opts.onMenu) {
      this.moreButton(el, `${opts.label} options`, opts.onMenu);
      el.addEventListener("contextmenu", opts.onMenu);
    }
    el.addEventListener("click", () => this.saveNav({ collapsed: toggleSection(collapsed, opts.key) }));
    return open ? parent.createDiv({ cls: "marktodo-nav-children" }) : null;
  }

  private groupNode(parent: HTMLElement, section: ProjectSection<NavProject>, all: readonly NavProject[]): HTMLElement | null {
    const label = section.label ?? "";
    const open = isSectionOpen(section, this.plugin.settings.nav.collapsed);
    const el = parent.createDiv({ cls: `marktodo-nav-row is-node is-group${section.archived ? " is-muted" : ""}` });
    el.setAttribute("role", "button");
    el.setAttribute("aria-expanded", String(open));
    setIcon(el.createSpan({ cls: `marktodo-nav-chevron${open ? " is-open" : ""}` }), "chevron-right");
    setIcon(el.createSpan({ cls: "marktodo-nav-icon" }), section.archived ? "archive" : "folder-tree");
    el.createSpan({ cls: "marktodo-nav-label", text: label });
    el.createSpan({ cls: "marktodo-nav-count", text: String(section.projects.length) });
    el.addEventListener("click", () =>
      this.saveNav({ collapsed: toggleSection(this.plugin.settings.nav.collapsed, section.key) }),
    );
    // Archived is a view of a flag, not a group you can rename.
    if (!section.archived) {
      const onMenu = (evt: MouseEvent): void => this.groupMenu(label, all, evt);
      this.moreButton(el, `${label} options`, onMenu);
      el.addEventListener("contextmenu", onMenu);
    }
    return open ? parent.createDiv({ cls: "marktodo-nav-children" }) : null;
  }

  private projectRow(parent: HTMLElement, project: NavProject, all: readonly NavProject[]): void {
    this.row(parent, {
      label: project.name,
      icon: project.archived ? "archive" : PROJECT_ICON,
      count: project.open,
      alert: project.overdue > 0,
      muted: project.archived,
      selection: { kind: "project", path: project.path },
      onMenu: (evt) => this.projectMenu(project, all, evt),
    });
  }

  /** A hover-revealed "…" that opens the same menu as right-click. */
  private moreButton(parent: HTMLElement, label: string, onMenu: (evt: MouseEvent) => void): void {
    parent.addClass("has-more");
    const more = parent.createSpan({ cls: "marktodo-nav-more", attr: { role: "button", "aria-label": label } });
    setIcon(more, "more-horizontal");
    more.addEventListener("click", (evt) => {
      evt.stopPropagation();
      onMenu(evt);
    });
  }

  // ── menus ─────────────────────────────────────────────────────────────────

  private newMenu(evt: MouseEvent, projects: readonly NavProject[]): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("New project…")
        .setIcon(PROJECT_ICON)
        .onClick((evt) => createProject(this.plugin, evt)),
    );
    menu.addItem((item) =>
      item
        .setTitle("New group…")
        .setIcon("folder-tree")
        .setDisabled(projects.length === 0)
        .onClick(() => this.editGroup(null, projects)),
    );
    menu.showAtMouseEvent(evt);
  }

  private sortMenu(evt: MouseEvent): void {
    const menu = new Menu();
    const current = this.plugin.settings.nav.sort;
    for (const { key, label } of PROJECT_SORTS) {
      menu.addItem((item) =>
        item
          .setTitle(label)
          .setChecked(current === key)
          .onClick(() => this.saveNav({ sort: key })),
      );
    }
    menu.showAtMouseEvent(evt);
  }

  private groupMenu(group: string, all: readonly NavProject[], evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Edit group…")
        .setIcon("pencil")
        .onClick(() => this.editGroup(group, all)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Delete group…")
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(() => this.editGroup(group, all, true)),
    );
    menu.showAtMouseEvent(evt);
  }

  private projectMenu(project: NavProject, all: readonly NavProject[], evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Open note")
        .setIcon("file-text")
        .onClick(() => void openNote(this.plugin, project.path)),
    );
    menu.addItem((item) =>
      item
        .setTitle(project.pinned ? "Unpin" : "Pin to top")
        .setIcon(project.pinned ? "pin-off" : "pin")
        .onClick(() => void this.setPinned(project, !project.pinned)),
    );
    menu.addSeparator();
    // Groups in use, inline — the menu IS the picker, one click to move.
    for (const group of existingGroups(all)) {
      menu.addItem((item) =>
        item
          .setTitle(group)
          .setIcon("folder-tree")
          .setChecked(project.group === group)
          .onClick(() => void this.setGroup(project, project.group === group ? null : group)),
      );
    }
    if (project.group !== null) {
      menu.addItem((item) =>
        item
          .setTitle("Remove from group")
          .setIcon("folder-minus")
          .onClick(() => void this.setGroup(project, null)),
      );
    }
    menu.addItem((item) =>
      item
        .setTitle("New group…")
        .setIcon("folder-plus")
        .onClick(() => this.editGroup(null, all, false, project.path)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(project.archived ? "Unarchive" : "Archive")
        .setIcon(project.archived ? "archive-restore" : "archive")
        .onClick(() => void this.setArchived(project, !project.archived)),
    );
    menu.showAtMouseEvent(evt);
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /**
   * Open the group editor. `startWith` pre-ticks a project (New group… from a
   * project's menu); `confirmDelete` goes straight to the delete confirmation.
   */
  private editGroup(
    group: string | null,
    projects: readonly NavProject[],
    confirmDelete = false,
    startWith?: string,
  ): void {
    const modal = new GroupModal(this.app, {
      projects,
      group,
      startWith,
      onDone: (from, to) => {
        if (from !== null) {
          this.plugin.settings.nav.collapsed = renameSectionKey(this.plugin.settings.nav.collapsed, from, to);
          void this.plugin.saveSettings();
        }
        new Notice(
          to === null ? `MarkTodo: group "${from}" deleted` : from === null ? `MarkTodo: group "${to}" created` : `MarkTodo: group "${to}" saved`,
        );
        this.signature = null;
        this.renderNav();
      },
    });
    if (confirmDelete) modal.confirmDelete();
    else modal.open();
  }

  /** Write a note-level frontmatter key; removing it when the value is null. */
  private async setNoteKey(project: NavProject, key: string, value: unknown): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(project.path);
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (value === null) delete fm[key];
      else fm[key] = value;
    });
    this.renderNav();
  }

  private async setGroup(project: NavProject, group: string | null): Promise<void> {
    await this.setNoteKey(project, GROUP_FM_KEY, group);
  }

  /**
   * Pinning is a note flag too, so it syncs with the vault and the companion
   * app can set it. Nothing else moves: a pin only decides which section of
   * this column the project is drawn in.
   */
  private async setPinned(project: NavProject, pinned: boolean): Promise<void> {
    await this.plugin.writer.setPinned(project.path, pinned);
    this.renderNav();
  }

  /**
   * Archiving sets the FLAG — canonical in both programs — and then
   * reconciles location, so the note moves right away when `archiveMovesNote`
   * is on instead of waiting for the next reload.
   */
  private async setArchived(project: NavProject, archived: boolean): Promise<void> {
    await this.setNoteKey(project, ARCHIVED_FM_KEY, archived ? true : null);
    new Notice(`MarkTodo: "${project.name}" ${archived ? "archived" : "unarchived"}`);
    await reconcileArchive(this.app, this.plugin.settings);
    this.renderNav();
  }
}
