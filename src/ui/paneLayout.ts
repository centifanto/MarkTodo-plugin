/**
 * Where MarkTodo's tabs open, and the dashboard's place. PURE — no Obsidian, no DOM.
 *
 * The dashboard is a two-column view like Notebook Navigator,
 * so a LIST is no longer a tab anywhere — it is the dashboard's own list column
 * (`dashboardNav.ts`). What still opens as a tab, always in the main area, is:
 *  - a Kanban board (Todos, or one project), and
 *  - a project's note (its Source mode).
 *
 * THE DASHBOARD IS SOVEREIGN. No plan here ever targets its tab
 * group. In the MAIN AREA it has a group to itself, and `planEvictions` moves
 * out anything that lands there anyway (a new tab, a drag). In a SIDEBAR it is
 * an ordinary tab in the sidebar's existing group, beside Files or Outline
 * — those tabs are the sidebar's own and are never moved.
 *
 * The workspace is described as flat `LeafInfo` records so every decision —
 * reuse, replace, open beside, split, what to evict — is tested without a
 * workspace. `obsidian/layout.ts` carries the plans out.
 */

/** A tab MarkTodo opens in the main area. */
export type Destination = { kind: "todos" } | { kind: "project"; path: string; mode: "kanban" | "source" };

/** Where the dashboard lives. The right sidebar is the default. */
export type DashboardLocation = "left" | "right" | "pane" | "main";

export const DASHBOARD_LOCATIONS: ReadonlyArray<{ key: DashboardLocation; label: string }> = [
  { key: "right", label: "Right sidebar" },
  { key: "left", label: "Left sidebar" },
  { key: "pane", label: "Pane at the left of the main area" },
  { key: "main", label: "Main area" },
];

export function parseDashboardLocation(value: unknown): DashboardLocation {
  return DASHBOARD_LOCATIONS.some((l) => l.key === value) ? (value as DashboardLocation) : "right";
}

export type Area = "root" | "left" | "right";

/** The view types, here so pure code can map a leaf's view state to a destination. */
export const VIEW_TYPES = {
  dashboard: "marktodo-nav",
  todos: "marktodo-todos",
  project: "marktodo-project",
} as const;

/** Same PLACE — the Todos board, or the same project in either of its tab modes. */
export function samePlace(a: Destination, b: Destination): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "project" && b.kind === "project" ? a.path === b.path : true;
}

/** Same place AND same mode: nothing to do but focus it. */
export function sameDestination(a: Destination, b: Destination): boolean {
  if (!samePlace(a, b)) return false;
  return a.kind !== "project" || b.kind !== "project" || a.mode === b.mode;
}

/**
 * Read a destination back out of a leaf's view state. `isProject` decides
 * whether a plain markdown leaf is a project note (the glue answers it from the
 * metadata cache). Anything else — another plugin's view, the empty tab, an
 * ordinary note, the dashboard — is not a MarkTodo destination.
 */
export function destinationOf(
  type: string,
  state: Record<string, unknown> | undefined,
  isProject: (path: string) => boolean,
): Destination | null {
  const file = typeof state?.file === "string" ? state.file : null;
  switch (type) {
    case VIEW_TYPES.todos:
      return { kind: "todos" };
    case VIEW_TYPES.project:
      return file === null ? null : { kind: "project", path: file, mode: "kanban" };
    case "markdown":
      return file !== null && isProject(file) ? { kind: "project", path: file, mode: "source" } : null;
    default:
      return null;
  }
}

/** A leaf, as much as the planners need to know about it. */
export interface LeafInfo {
  id: string;
  /** The main area, or a sidebar. */
  area: Area;
  /** Identity of its tab group. */
  group: string;
  /** What it shows, if it is a MarkTodo destination. */
  dest: Destination | null;
  /** It is the dashboard. */
  dashboard: boolean;
  /** Obsidian's `activeTime` — the larger, the more recently used. */
  activeTime: number;
  /** A pinned tab is never navigated away from. */
  pinned: boolean;
  /** The "New tab" placeholder — always fine to fill. */
  empty: boolean;
  /** The note it shows, for a markdown leaf; null otherwise. */
  file: string | null;
}

export type OpenTarget =
  /** Show it in this leaf (replacing what is there, or already showing it). */
  | { kind: "leaf"; id: string }
  /** A new tab in this leaf's group. */
  | { kind: "tab-beside"; id: string }
  /** Nothing usable in the main area: split a new group off `anchor`. */
  | { kind: "new-main"; anchor: string | null; before: boolean };

export interface OpenPlan {
  target: OpenTarget;
  /** It is already there in that mode — focus, don't reload. */
  focusOnly: boolean;
}

/** A project's note is the user's own tab, not a MarkTodo view. */
const isNote = (dest: Destination): boolean => dest.kind === "project" && dest.mode === "source";

const mostRecent = (leaves: readonly LeafInfo[]): LeafInfo | null =>
  leaves.reduce<LeafInfo | null>((best, l) => (best === null || l.activeTime > best.activeTime ? l : best), null);

/** Tab groups that hold a dashboard — never a target for anything else. */
export function dashboardGroups(leaves: readonly LeafInfo[]): Set<string> {
  return new Set(leaves.filter((l) => l.dashboard).map((l) => l.group));
}

/** The main area's leaves that are fair game: not the dashboard, not in its group. */
function mainLeaves(leaves: readonly LeafInfo[]): LeafInfo[] {
  const sovereign = dashboardGroups(leaves);
  return leaves.filter((l) => l.area === "root" && !sovereign.has(l.group));
}

/**
 * New main-area space, split off to the RIGHT of what is there — of the
 * dashboard itself when it lives in the main area and is all there is.
 */
function newMain(leaves: readonly LeafInfo[]): OpenTarget {
  const root = leaves.filter((l) => l.area === "root");
  const last = root[root.length - 1];
  return { kind: "new-main", anchor: last?.id ?? null, before: false };
}

/**
 * Decide how to open a board or a project note.
 *
 * `from` is the tab a toggle was pressed in (Kanban ⇄ Source): that tab IS the
 * thing changing, so it changes in place. Without `from`, an open board of the
 * same place is focused, but an open NOTE is not taken for the board.
 */
export function planOpen(leaves: readonly LeafInfo[], dest: Destination, opts: { from?: string } = {}): OpenPlan {
  const main = mainLeaves(leaves);
  const from = main.find((l) => l.id === opts.from) ?? null;
  const same =
    from ??
    mostRecent(main.filter((l) => l.dest !== null && samePlace(l.dest, dest) && (!isNote(l.dest) || isNote(dest))));
  if (same) {
    const exact = same.dest !== null && sameDestination(same.dest, dest);
    return { target: { kind: "leaf", id: same.id }, focusOnly: exact };
  }
  const current = mostRecent(main);
  return { target: current ? fillOrBeside(current) : newMain(leaves), focusOnly: false };
}

/**
 * Where a NOTE opens when a todo list asks for it ("open in note", a note
 * heading in the Inbox): the main area, never a sidebar or the dashboard's
 * group. A tab already showing the note is reused; otherwise the most recent
 * main tab navigates, as `getLeaf(false)` would, unless it is pinned.
 */
export function planOpenNote(leaves: readonly LeafInfo[], path: string): OpenTarget {
  const main = mainLeaves(leaves);
  const open = mostRecent(main.filter((l) => l.file === path));
  if (open) return { kind: "leaf", id: open.id };
  const current = mostRecent(main);
  if (!current) return newMain(leaves);
  return current.pinned ? { kind: "tab-beside", id: current.id } : { kind: "leaf", id: current.id };
}

/**
 * Our own views and the empty tab are recycled, the way the file explorer
 * recycles a tab. A note (or another plugin's view) is never navigated away
 * from by MarkTodo — the new tab opens beside it — and neither is a pin.
 */
function fillOrBeside(leaf: LeafInfo): OpenTarget {
  const ours = leaf.dest !== null && !isNote(leaf.dest);
  return !leaf.pinned && (leaf.empty || ours) ? { kind: "leaf", id: leaf.id } : { kind: "tab-beside", id: leaf.id };
}

// ── the dashboard ──────────────────────────────────────────────────────────

export type DashboardTarget =
  /** Fill this empty main-area tab — it is alone in its group, so the group is already its own. */
  | { kind: "reuse"; id: string }
  /**
   * A tab in the sidebar's existing group, after `beside` (a tab already there);
   * null when the sidebar is empty.
   */
  | { kind: "sidebar"; side: "left" | "right"; beside: string | null }
  /** A group of its own at the left edge of the main area, split off `anchor`. */
  | { kind: "split"; anchor: string | null };

export type DashboardPlan =
  /** Already where the setting says, in a group of its own. */
  | { kind: "focus"; id: string }
  /** Put it there, closing `detach` (the dashboard's old leaf, if any) afterwards. */
  | { kind: "place"; target: DashboardTarget; detach: string | null };

const areaOfDashboard = (location: DashboardLocation): Area =>
  location === "left" ? "left" : location === "right" ? "right" : "root";

/**
 * Where the dashboard goes.
 *
 * - A SIDEBAR: a tab in the sidebar's existing group. A dashboard already in that
 *   sidebar stays where it is — unless it sits in a group of its own while the
 *   sidebar has another (older versions stacked it that way), in which case it moves
 *   in beside that group's tabs.
 * - The MAIN AREA: always alone in its tab group — split off at the left edge,
 *   or filling a main area that is nothing but one empty tab.
 */
export function planDashboard(leaves: readonly LeafInfo[], location: DashboardLocation): DashboardPlan {
  const area = areaOfDashboard(location);
  const dashboard = mostRecent(leaves.filter((l) => l.dashboard));
  const others = leaves.filter((l) => !l.dashboard);
  const detach = dashboard?.id ?? null;
  const alone = (l: LeafInfo): boolean => leaves.every((o) => o.group !== l.group || o.id === l.id);

  if (area !== "root") {
    const sidebar = others.filter((l) => l.area === area);
    if (dashboard && dashboard.area === area) {
      const stacked = alone(dashboard) && sidebar.length > 0;
      if (!stacked) return { kind: "focus", id: dashboard.id };
    }
    const beside = mostRecent(sidebar);
    return { kind: "place", target: { kind: "sidebar", side: area, beside: beside?.id ?? null }, detach };
  }

  if (dashboard && dashboard.area === "root" && alone(dashboard)) return { kind: "focus", id: dashboard.id };
  const root = others.filter((l) => l.area === "root");
  // A main area that is nothing but one empty tab: the dashboard can simply take it.
  if (location === "main" && root.length === 1 && root[0].empty) {
    return { kind: "place", target: { kind: "reuse", id: root[0].id }, detach };
  }
  return { kind: "place", target: { kind: "split", anchor: root[0]?.id ?? null }, detach };
}

/** Groups where the dashboard is alone right now — the ones the guard defends. */
export function soleDashboardGroups(leaves: readonly LeafInfo[]): Set<string> {
  return new Set(
    leaves.filter((l) => l.dashboard && leaves.every((o) => o.group !== l.group || o.id === l.id)).map((l) => l.group),
  );
}

export interface Eviction {
  /** The leaf that landed in the dashboard's group. */
  id: string;
  target: OpenTarget;
}

/**
 * Anything that lands in a MAIN-AREA dashboard's group is moved out (the
 * sovereignty guard). Only groups that were the dashboard's ALONE at the last
 * check (`wasSole`) are defended: if you drag the dashboard into a group of
 * notes yourself, those notes were there first and are not thrown out. A
 * sidebar dashboard is a tab among the sidebar's own and is never defended.
 *
 * An intruder is reopened as a NEW TAB — beside the most recent tab in the main
 * area, or in a group split off for it — never over something you had open.
 */
export function planEvictions(leaves: readonly LeafInfo[], wasSole: ReadonlySet<string>): Eviction[] {
  const sovereign = dashboardGroups(leaves);
  const evictions: Eviction[] = [];
  for (const dashboard of leaves.filter((l) => l.dashboard && l.area === "root" && wasSole.has(l.group))) {
    const intruders = leaves.filter((l) => l.group === dashboard.group && !l.dashboard);
    if (intruders.length === 0) continue;
    const home = mostRecent(leaves.filter((l) => l.area === "root" && !sovereign.has(l.group)));
    for (const intruder of intruders) {
      evictions.push({ id: intruder.id, target: home ? { kind: "tab-beside", id: home.id } : newMain(leaves) });
    }
  }
  return evictions;
}

// ── sizing ─────────────────────────────────────────────────────────────────

/** Default dashboard width when it is a pane in the main area — room for two columns. */
export const DASHBOARD_WIDTH_PX = 600;
/** A sidebar holding a two-column dashboard is widened to at least this. */
export const DUAL_SIDEBAR_PX = 600;
export const PANE_MIN_SHARE = 0.2;
export const PANE_MAX_SHARE = 0.45;

/**
 * Flex dimensions (Obsidian's percentages) for the children of one split, after
 * sizing child `index` to about `target` px. `fixed` children keep their size;
 * the rest keep their proportions of what is left. Shares are of the space not
 * held by fixed children. Null when nothing is measurable.
 */
export function paneDimensions(
  sizes: readonly number[],
  index: number,
  target: number,
  opts: { minShare?: number; maxShare?: number; fixed?: readonly number[] } = {},
): number[] | null {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (sizes.length < 2 || total <= 0 || index < 0 || index >= sizes.length) return null;
  const fixed = new Set((opts.fixed ?? []).filter((i) => i !== index && i >= 0 && i < sizes.length));
  const fixedTotal = [...fixed].reduce((n, i) => n + sizes[i], 0);
  const space = total - fixedTotal;
  const clamped = Math.min(
    Math.max(target, space * (opts.minShare ?? PANE_MIN_SHARE)),
    space * (opts.maxShare ?? PANE_MAX_SHARE),
  );
  const rest = Math.max(0, total - clamped - fixedTotal);
  const flexible = sizes.map((_, i) => i).filter((i) => i !== index && !fixed.has(i));
  const flexTotal = flexible.reduce((n, i) => n + sizes[i], 0);
  const round = (n: number): number => Math.round(n * 100) / 100;
  return sizes.map((size, i) => {
    if (i === index) return round((clamped / total) * 100);
    if (fixed.has(i)) return round((size / total) * 100);
    const share = flexTotal > 0 ? size / flexTotal : 1 / flexible.length;
    return round(((share * rest) / total) * 100);
  });
}
