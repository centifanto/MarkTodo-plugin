/**
 * Putting MarkTodo's tabs in the right place, placing the dashboard and
 * defending its group — the Obsidian half of `ui/paneLayout.ts`. That module
 * decides; this one reads the workspace into `LeafInfo` records and carries the
 * plans out.
 *
 * A LIST is not a tab: it is the dashboard's selection, shown in
 * its own list column (`showInDashboard`). What opens as a tab — always in the
 * main area — is a Kanban board or a project's note (`openBoard`, `openNote`).
 *
 * Obsidian internals used, all guarded so a future Obsidian that drops them
 * degrades to "not resized" rather than an error:
 *  - `WorkspaceLeaf.id` / `activeTime` / `pinned` — identity and recency.
 *  - `WorkspaceItem.setDimension` + `children` — the flex share Obsidian's own
 *    split handle writes, persisted in workspace.json.
 *  - `WorkspaceSidedock.size` / `setSize` — a sidebar's width.
 *
 * Every activation goes through `setActiveLeaf`, never `revealLeaf`: revealing
 * a leaf whose tab isn't the selected one FLASHES its tab header.
 */
import { MarkdownView, Platform, TFile, type WorkspaceLeaf, type WorkspaceSplit } from "obsidian";
import { AppOfferModal } from "./deviceMode";
import {
  DASHBOARD_WIDTH_PX,
  DUAL_SIDEBAR_PX,
  VIEW_TYPES,
  dashboardGroups,
  destinationOf,
  paneDimensions,
  planDashboard,
  planEvictions,
  planOpen,
  planOpenNote,
  soleDashboardGroups,
  type Destination,
  type LeafInfo,
  type OpenTarget,
} from "../ui/paneLayout";
import { MIN_DUAL_WIDTH, type Selection } from "../ui/dashboardNav";
import { isProjectFrontmatter } from "./projects";
import type MarkTodoPlugin from "../../main";

/** The internals described above, all optional. */
interface LeafInternals {
  id?: string;
  activeTime?: number;
  pinned?: boolean;
}
interface ItemInternals {
  parent?: ItemInternals | null;
  children?: ItemInternals[];
  containerEl?: HTMLElement;
  setDimension?: (dimension: number | null) => void;
}
interface SidedockInternals {
  size?: number;
  setSize?: (px: number) => void;
  collapsed?: boolean;
  expand?: () => void;
}

/** What the dashboard view exposes to the rest of the plugin (duck-typed: no import cycle). */
export interface DashboardHandle {
  select(selection: Selection): void;
}

const fallbackIds = new WeakMap<object, string>();
let fallbackSeq = 0;
function idOf(item: object): string {
  const own = (item as LeafInternals).id;
  if (typeof own === "string" && own !== "") return own;
  let id = fallbackIds.get(item);
  if (id === undefined) {
    id = `mt-${++fallbackSeq}`;
    fallbackIds.set(item, id);
  }
  return id;
}

/** Whether a vault path is a project note, by its frontmatter. */
export function isProjectPath(plugin: MarkTodoPlugin, path: string): boolean {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  return isProjectFrontmatter(fm);
}

interface Snapshot {
  infos: LeafInfo[];
  leaves: Map<string, WorkspaceLeaf>;
}

/**
 * The main window's leaves — main area and both sidebars — in layout order, as
 * `LeafInfo`. Pop-out windows are left out: MarkTodo never opens into one.
 */
function snapshot(plugin: MarkTodoPlugin): Snapshot {
  const infos: LeafInfo[] = [];
  const leaves = new Map<string, WorkspaceLeaf>();
  const { workspace } = plugin.app;
  workspace.iterateAllLeaves((leaf) => {
    const root = leaf.getRoot();
    if (root !== workspace.rootSplit && root !== workspace.leftSplit && root !== workspace.rightSplit) return;
    const state = leaf.getViewState();
    const id = idOf(leaf);
    const internals = leaf as unknown as LeafInternals;
    leaves.set(id, leaf);
    infos.push({
      id,
      area: root === workspace.rightSplit ? "right" : root === workspace.leftSplit ? "left" : "root",
      group: idOf(leaf.parent),
      dest: destinationOf(state.type, state.state, (path) => isProjectPath(plugin, path)),
      dashboard: state.type === VIEW_TYPES.dashboard,
      activeTime: internals.activeTime ?? 0,
      pinned: internals.pinned === true,
      empty: state.type === "empty",
      file: state.type === "markdown" && typeof state.state?.file === "string" ? state.state.file : null,
    });
  });
  return { infos, leaves };
}

/**
 * Lightweight mode has no dashboard or boards: every way in — the
 * ribbon, a command, a hotkey — shows the app popup instead.
 */
function offerApp(plugin: MarkTodoPlugin): void {
  new AppOfferModal(plugin, false).open();
}

/**
 * Show something in the dashboard's list column — opening the dashboard where
 * the Layout setting says if it isn't open. In one-column mode this is the list
 * with its back button.
 */
export async function showInDashboard(plugin: MarkTodoPlugin, selection: Selection): Promise<void> {
  if (plugin.lightweight) return offerApp(plugin);
  await openDashboard(plugin);
  const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPES.dashboard)[0];
  await (leaf as { loadIfDeferred?: () => Promise<void> } | undefined)?.loadIfDeferred?.();
  (leaf?.view as unknown as Partial<DashboardHandle> | undefined)?.select?.(selection);
}

/**
 * Open a Kanban board or a project's note in the main area. `from` is the tab a
 * Kanban ⇄ Source toggle was pressed in — that tab changes in place.
 */
export async function openBoard(plugin: MarkTodoPlugin, dest: Destination, from?: WorkspaceLeaf): Promise<void> {
  if (plugin.lightweight) return offerApp(plugin);
  const { workspace } = plugin.app;
  const snap = snapshot(plugin);
  const plan = planOpen(snap.infos, dest, { from: from ? idOf(from) : undefined });
  const { leaf, resize } = resolveTarget(plugin, snap, plan.target);
  if (!leaf) return;
  if (!plan.focusOnly) {
    if (dest.kind === "todos") {
      await leaf.setViewState({ type: VIEW_TYPES.todos, active: true });
    } else if (dest.mode === "kanban") {
      await leaf.setViewState({ type: VIEW_TYPES.project, active: true, state: { file: dest.path } });
    } else {
      const file = plugin.app.vault.getAbstractFileByPath(dest.path);
      if (file instanceof TFile) await leaf.openFile(file);
    }
  }
  for (const r of resize) sizeGroup(plugin, r.leaf, r.px, true);
  workspace.setActiveLeaf(leaf, { focus: true });
  // A restored background tab is a placeholder until loaded (Obsidian ≥ 1.7.2).
  await (leaf as { loadIfDeferred?: () => Promise<void> }).loadIfDeferred?.();
}

/** Open a note in the main area, optionally on a line — never in a sidebar or over the dashboard. */
export async function openNote(plugin: MarkTodoPlugin, path: string, line?: number): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const snap = snapshot(plugin);
  const { leaf, resize } = resolveTarget(plugin, snap, planOpenNote(snap.infos, path));
  if (!leaf) return;

  const showing = leaf.getViewState();
  if (!(showing.type === "markdown" && showing.state?.file === path)) await leaf.openFile(file);
  for (const r of resize) sizeGroup(plugin, r.leaf, r.px, true);
  plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
  if (line !== undefined && leaf.view instanceof MarkdownView) {
    const pos = { line, ch: 0 };
    leaf.view.editor.setCursor(pos);
    leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
}

/** A group to size once a split exists: the leaf in it, and the width wanted. */
interface Resize {
  leaf: WorkspaceLeaf;
  px: number;
}

/**
 * The leaf to show things in, plus any group that needs sizing because a split
 * was just made. Never the dashboard's group — the planners guarantee that, and
 * this only ever splits AWAY from it.
 */
function resolveTarget(
  plugin: MarkTodoPlugin,
  snap: Snapshot,
  target: OpenTarget,
): { leaf: WorkspaceLeaf | null; resize: Resize[] } {
  const { workspace } = plugin.app;
  const leafOf = (id: string | null): WorkspaceLeaf | undefined => (id === null ? undefined : snap.leaves.get(id));
  switch (target.kind) {
    case "leaf":
      return { leaf: leafOf(target.id) ?? null, resize: [] };
    case "tab-beside": {
      const beside = leafOf(target.id);
      if (!beside) return { leaf: null, resize: [] };
      // Straight into the neighbor's own group, right after it. Not
      // \`getLeaf("tab")\`: that picks the most recent MAIN-AREA group, so a view
      // meant for a sidebar would land in your notes.
      const group = beside.parent as unknown as ItemInternals & WorkspaceSplit;
      const index = (group.children ?? []).indexOf(beside);
      return { leaf: workspace.createLeafInParent(group, index + 1), resize: [] };
    }
    case "new-main": {
      const anchorInfo = snap.infos.find((l) => l.id === target.anchor);
      const anchor = leafOf(target.anchor);
      if (!anchor || !anchorInfo) return { leaf: workspace.getLeaf("tab"), resize: [] };
      const created = workspace.createLeafBySplit(anchor, "vertical", target.before);
      // A dashboard split off as a pane keeps its width; a "main area" one shares.
      const fromPane = dashboardGroups(snap.infos).has(anchorInfo.group) && plugin.settings.dashboardLocation === "pane";
      return { leaf: created, resize: fromPane ? [{ leaf: anchor, px: paneWidthOf(plugin) }] : [] };
    }
  }
}

/**
 * The px width a dashboard pane is held at: the width you dragged it to — but
 * wide enough for two columns when that is the layout.
 */
function paneWidthOf(plugin: MarkTodoPlugin): number {
  const { dashboardWidth, paneMode } = plugin.settings;
  return paneMode === "dual" && dashboardWidth < MIN_DUAL_WIDTH ? DASHBOARD_WIDTH_PX : dashboardWidth;
}

/**
 * Two columns need room: a sidebar holding the dashboard in two-column mode is
 * widened to `DUAL_SIDEBAR_PX` when it is narrower — once, when the dashboard
 * is placed or the layout changes; after that its width is yours to drag.
 */
function widenSidebarForTwoColumns(plugin: MarkTodoPlugin, leaf: WorkspaceLeaf): void {
  if (plugin.settings.paneMode !== "dual" || Platform.isMobile) return;
  const { leftSplit, rightSplit } = plugin.app.workspace;
  const root = leaf.getRoot();
  if (root !== leftSplit && root !== rightSplit) return;
  const dock = root as unknown as SidedockInternals;
  if ((dock.size ?? 0) >= DUAL_SIDEBAR_PX) return;
  dock.setSize?.(DUAL_SIDEBAR_PX);
  plugin.app.workspace.requestSaveLayout();
}

/**
 * A view in a collapsed sidebar would open invisibly. Expanding is done by hand
 * rather than with `revealLeaf`, which would flash the tab (see header).
 */
function expandSidebarOf(plugin: MarkTodoPlugin, leaf: WorkspaceLeaf): void {
  const { leftSplit, rightSplit } = plugin.app.workspace;
  const root = leaf.getRoot();
  if (root !== leftSplit && root !== rightSplit) return;
  const dock = root as unknown as SidedockInternals;
  if (dock.collapsed) dock.expand?.();
}

/**
 * Close a leaf without the dashboard absorbing its space. Obsidian sizes splits
 * by flex share, so when a group disappears its share is handed out in
 * proportion — and a 300px dashboard beside a closed content pane grew to half
 * the window. Measure first, close, then put the dashboard's width back (the
 * width it HAD, so one you dragged yourself survives too).
 */
function closeKeepingDashboard(plugin: MarkTodoPlugin, leaf: WorkspaceLeaf | undefined): void {
  if (!leaf) return;
  const dashboard = plugin.app.workspace
    .getLeavesOfType(VIEW_TYPES.dashboard)
    .find((l) => l.getRoot() === plugin.app.workspace.rootSplit && l.parent !== leaf.parent);
  const group = dashboard?.parent as unknown as ItemInternals | undefined;
  const width = group?.containerEl?.getBoundingClientRect().width ?? 0;
  leaf.detach();
  if (dashboard && width > 0) sizeGroup(plugin, dashboard, width, true);
}

/**
 * Size the main-area tab group holding `leaf` to a width in px (best effort —
 * see header). A dashboard's own group keeps its size when a neighbor is sized.
 * `exact` takes the width as given instead of clamping it to a share.
 */
function sizeGroup(plugin: MarkTodoPlugin, leaf: WorkspaceLeaf, px: number, exact = false): void {
  const group = leaf.parent as unknown as ItemInternals;
  const split = group?.parent;
  const children = split?.children;
  if (!children || children.length < 2) return;
  const sizes = children.map((c) => c.containerEl?.getBoundingClientRect().width ?? 0);
  const dashboardEls = new Set(
    plugin.app.workspace.getLeavesOfType(VIEW_TYPES.dashboard).map((l) => (l.parent as unknown as ItemInternals)),
  );
  const fixed = children.map((c, i) => (dashboardEls.has(c) ? i : -1)).filter((i) => i >= 0);
  const dims = paneDimensions(sizes, children.indexOf(group), px, exact ? { fixed, minShare: 0, maxShare: 1 } : { fixed });
  if (!dims) return;
  children.forEach((child, i) => child.setDimension?.(dims[i]));
  // Layout state: persist it the way dragging the split handle would.
  plugin.app.workspace.requestSaveLayout();
}

// ── the dashboard ──────────────────────────────────────────────────────────

/**
 * Show the dashboard where Settings → Layout says, in a tab group of
 * its own. `resize` re-applies the location's size to a dashboard that is
 * already there — used when a Layout setting changes; a plain "open the
 * dashboard" leaves a width you dragged alone.
 */
export async function openDashboard(
  plugin: MarkTodoPlugin,
  opts: { resize?: boolean; reveal?: boolean } = {},
): Promise<void> {
  if (plugin.lightweight) return offerApp(plugin);
  const reveal = opts.reveal ?? true;
  const { workspace } = plugin.app;
  const type = VIEW_TYPES.dashboard;

  // A phone has the left drawer and nothing else worth the name.
  if (Platform.isPhone) {
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      await leaf?.setViewState({ type, active: true });
    }
    if (!leaf) return;
    expandSidebarOf(plugin, leaf);
    workspace.setActiveLeaf(leaf, { focus: false });
    return;
  }

  const location = plugin.settings.dashboardLocation;
  const snap = snapshot(plugin);
  const plan = planDashboard(snap.infos, location);
  let leaf: WorkspaceLeaf | null;
  let placed = false;

  if (plan.kind === "focus") {
    leaf = snap.leaves.get(plan.id) ?? null;
  } else {
    const target = plan.target;
    const anchor = target.kind === "split" && target.anchor !== null ? snap.leaves.get(target.anchor) : undefined;
    if (target.kind === "reuse") {
      leaf = snap.leaves.get(target.id) ?? null;
    } else if (target.kind === "sidebar") {
      // A tab in the sidebar's existing group, right after the tab it goes beside.
      const beside = target.beside !== null ? snap.leaves.get(target.beside) : undefined;
      if (beside) {
        const group = beside.parent as unknown as ItemInternals & WorkspaceSplit;
        const index = (group.children ?? []).indexOf(beside);
        leaf = workspace.createLeafInParent(group, index + 1);
      } else {
        leaf = target.side === "left" ? workspace.getLeftLeaf(false) : workspace.getRightLeaf(false);
      }
    } else {
      leaf = anchor ? workspace.createLeafBySplit(anchor, "vertical", true) : workspace.getLeaf("tab");
    }
    if (!leaf) return;
    await leaf.setViewState({ type, active: reveal });
    if (plan.detach !== null) snap.leaves.get(plan.detach)?.detach();
    placed = true;
  }
  if (!leaf) return;

  // Before sizing: a collapsed sidebar measures 0 tall, and nothing gets sized.
  if (reveal) expandSidebarOf(plugin, leaf);
  if (leaf.getRoot() === workspace.rootSplit) {
    // Obsidian never navigates a pinned tab: opening a file while the dashboard
    // is focused lands in your most recent note tab instead. The guard below
    // catches what pinning cannot (a new tab, a drag).
    leaf.setPinned(true);
    if ((placed || opts.resize) && location === "pane") sizeGroup(plugin, leaf, paneWidthOf(plugin), true);
  } else if (placed || opts.resize) {
    widenSidebarForTwoColumns(plugin, leaf);
  }
  if (reveal) workspace.setActiveLeaf(leaf, { focus: false });
}

/**
 * The sovereignty guard: nothing opens over the dashboard or takes over its tab
 * group.
 *
 * MarkTodo's own opens never target the dashboard's group (the planners), and a
 * pinned dashboard is never navigated by Obsidian. What is left — a new tab
 * made while the dashboard's group was the most recent, a sidebar view Obsidian
 * adds to the dashboard's group, a tab dragged onto it — lands there anyway.
 * After every layout change this moves each such leaf out, as a new tab in the
 * same area (`planEvictions`), and remembers which groups the dashboard holds
 * alone so a group you deliberately dragged it into is left as you made it.
 */
export class DashboardGuard {
  private sole = new Set<string>();
  private pending = false;
  private busy = false;
  /** A split divider is being dragged — the one time a width change is the user's. */
  private dragging = false;

  constructor(private plugin: MarkTodoPlugin) {}

  register(): void {
    const { workspace } = this.plugin.app;
    workspace.onLayoutReady(() => {
      // A dashboard restored from an older version may still be one tab among
      // Files and Search. If there is a dashboard at all, give it its own group
      // where the setting says — quietly: nothing is focused or expanded.
      // Deferred a beat: when the plugin is (re)enabled with a layout already
      // up, Obsidian gives the leaf back its dashboard view only after onload.
      window.setTimeout(() => {
        const exists = workspace.getLeavesOfType(VIEW_TYPES.dashboard).length > 0;
        void (exists ? openDashboard(this.plugin, { reveal: false }) : Promise.resolve()).finally(() => {
          this.remember();
          this.holdWidth();
        });
      }, 500);
    });
    this.plugin.registerEvent(workspace.on("layout-change", () => this.schedule()));
    // Obsidian sizes splits by SHARE, so a window resize or a sidebar opening
    // stretches a "slim" dashboard in proportion. It is held at its px width
    // instead; dragging its divider is how you change that width, and the drag
    // is remembered.
    this.plugin.registerEvent(workspace.on("resize", () => this.holdWidth()));
    this.plugin.registerDomEvent(document, "mousedown", (evt) => {
      const target = evt.target as HTMLElement | null;
      if (target?.closest(".workspace-leaf-resize-handle")) this.dragging = true;
    });
    this.plugin.registerDomEvent(document, "mouseup", () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.recordWidth();
    });
  }

  /** The dashboard as a pane at the left of the main area, if that is where it lives. */
  private slimDashboard(): WorkspaceLeaf | null {
    const { workspace } = this.plugin.app;
    if (this.plugin.settings.dashboardLocation !== "pane" || Platform.isPhone) return null;
    return workspace.getLeavesOfType(VIEW_TYPES.dashboard).find((l) => l.getRoot() === workspace.rootSplit) ?? null;
  }

  private widthOf(leaf: WorkspaceLeaf): number {
    return (leaf.parent as unknown as ItemInternals).containerEl?.getBoundingClientRect().width ?? 0;
  }

  private holdWidth(): void {
    const leaf = this.slimDashboard();
    if (!leaf || this.dragging) return;
    // Never more than 60% of the main area, however narrow the window gets.
    const root = (this.plugin.app.workspace.rootSplit as unknown as ItemInternals).containerEl;
    const want = Math.min(paneWidthOf(this.plugin), (root?.getBoundingClientRect().width ?? Infinity) * 0.6);
    if (Math.abs(this.widthOf(leaf) - want) > 2) sizeGroup(this.plugin, leaf, want, true);
  }

  private recordWidth(): void {
    const leaf = this.slimDashboard();
    if (!leaf) return;
    const width = Math.round(this.widthOf(leaf));
    if (width < 160 || width === this.plugin.settings.dashboardWidth) return;
    this.plugin.settings.dashboardWidth = width;
    void this.plugin.saveSettings();
  }

  /** Coalesce a burst of layout changes into one check, after they settle. */
  private schedule(): void {
    if (this.pending || this.busy) return;
    this.pending = true;
    window.setTimeout(() => {
      this.pending = false;
      void this.check();
    }, 0);
  }

  private remember(): void {
    this.sole = soleDashboardGroups(snapshot(this.plugin).infos);
  }

  private async check(): Promise<void> {
    if (Platform.isPhone) return;
    this.busy = true;
    try {
      const { workspace } = this.plugin.app;
      const snap = snapshot(this.plugin);
      for (const eviction of planEvictions(snap.infos, this.sole)) {
        const intruder = snap.leaves.get(eviction.id);
        if (!intruder) continue;
        const state = intruder.getViewState();
        const ephemeral: unknown = intruder.getEphemeralState();
        const { leaf, resize } = resolveTarget(this.plugin, snap, eviction.target);
        if (!leaf) continue;
        await leaf.setViewState({ ...state, active: true }, ephemeral);
        closeKeepingDashboard(this.plugin, intruder);
        for (const r of resize) sizeGroup(this.plugin, r.leaf, r.px, true);
        expandSidebarOf(this.plugin, leaf);
        workspace.setActiveLeaf(leaf, { focus: true });
      }
      // A dashboard dragged into the main area gets the same protection as one
      // placed there.
      for (const info of snap.infos) {
        if (info.dashboard && info.area === "root" && !info.pinned) snap.leaves.get(info.id)?.setPinned(true);
      }
    } finally {
      this.remember();
      this.holdWidth();
      this.busy = false;
    }
  }
}
