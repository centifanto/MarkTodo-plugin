import { describe, it, expect } from "vitest";
import {
  PANE_MAX_SHARE,
  PANE_MIN_SHARE,
  VIEW_TYPES,
  destinationOf,
  paneDimensions,
  parseDashboardLocation,
  planDashboard,
  planEvictions,
  planOpen,
  planOpenNote,
  sameDestination,
  samePlace,
  soleDashboardGroups,
  type Destination,
  type LeafInfo,
} from "../../src/ui/paneLayout";

const TODOS: Destination = { kind: "todos" };
const project = (path: string, mode: "kanban" | "source"): Destination => ({ kind: "project", path, mode });

let seq = 0;
function leaf(id: string, group: string, dest: Destination | null, over: Partial<LeafInfo> = {}): LeafInfo {
  return {
    id,
    area: "root",
    group,
    dest,
    dashboard: false,
    activeTime: ++seq,
    pinned: false,
    empty: false,
    file: dest?.kind === "project" && dest.mode === "source" ? dest.path : null,
    ...over,
  };
}
const note = (id: string, group: string, file: string, over: Partial<LeafInfo> = {}): LeafInfo =>
  leaf(id, group, null, { file, ...over });
const dash = (id: string, group: string, area: LeafInfo["area"] = "right", over: Partial<LeafInfo> = {}): LeafInfo =>
  leaf(id, group, null, { area, dashboard: true, ...over });
const side = (id: string, group: string, area: LeafInfo["area"] = "right"): LeafInfo => leaf(id, group, null, { area });

describe("identity", () => {
  it("treats a project's board and note as the same place, in different modes", () => {
    expect(samePlace(project("A.md", "kanban"), project("A.md", "source"))).toBe(true);
    expect(sameDestination(project("A.md", "kanban"), project("A.md", "source"))).toBe(false);
    expect(samePlace(project("A.md", "kanban"), project("B.md", "kanban"))).toBe(false);
    expect(samePlace(TODOS, project("A.md", "kanban"))).toBe(false);
  });

  it("reads destinations back out of view state", () => {
    const isProject = (p: string) => p === "A.md";
    expect(destinationOf(VIEW_TYPES.todos, {}, isProject)).toEqual(TODOS);
    expect(destinationOf(VIEW_TYPES.project, { file: "A.md" }, isProject)).toEqual(project("A.md", "kanban"));
    expect(destinationOf(VIEW_TYPES.project, {}, isProject)).toBeNull();
    expect(destinationOf("markdown", { file: "A.md" }, isProject)).toEqual(project("A.md", "source"));
    expect(destinationOf("markdown", { file: "Daily.md" }, isProject)).toBeNull();
    expect(destinationOf(VIEW_TYPES.dashboard, {}, isProject)).toBeNull();
  });

  it("parses the stored dashboard location, defaulting to the right sidebar", () => {
    expect(parseDashboardLocation("main")).toBe("main");
    expect(parseDashboardLocation(undefined)).toBe("right");
  });
});

describe("planOpen — boards and notes, always the main area", () => {
  it("focuses a board that is already open", () => {
    const leaves = [note("n", "g", "x.md"), leaf("k", "g", TODOS)];
    expect(planOpen(leaves, TODOS)).toEqual({ target: { kind: "leaf", id: "k" }, focusOnly: true });
  });

  it("opens a board BESIDE a note rather than navigating the note away", () => {
    expect(planOpen([note("n", "g", "x.md")], TODOS).target).toEqual({ kind: "tab-beside", id: "n" });
  });

  it("recycles our own board and the empty tab, never a pinned one", () => {
    expect(planOpen([leaf("k", "g", project("B.md", "kanban"))], TODOS).target).toEqual({ kind: "leaf", id: "k" });
    expect(planOpen([leaf("e", "g", null, { empty: true })], TODOS).target).toEqual({ kind: "leaf", id: "e" });
    const pinned = leaf("k", "g", project("B.md", "kanban"), { pinned: true });
    expect(planOpen([pinned], TODOS).target).toEqual({ kind: "tab-beside", id: "k" });
  });

  it("flips Kanban and Source in the same tab", () => {
    const leaves = [leaf("k", "g", project("A.md", "kanban"))];
    expect(planOpen(leaves, project("A.md", "source"), { from: "k" })).toEqual({
      target: { kind: "leaf", id: "k" },
      focusOnly: false,
    });
  });

  it("does not take an open project NOTE for its board", () => {
    const leaves = [note("n", "g", "A.md", { dest: project("A.md", "source") })];
    expect(planOpen(leaves, project("A.md", "kanban")).target).toEqual({ kind: "tab-beside", id: "n" });
    expect(planOpen(leaves, project("A.md", "source")).focusOnly).toBe(true);
  });

  it("never opens into the dashboard's group — a main-area dashboard gets a split to its right", () => {
    expect(planOpen([dash("d", "dg", "root")], TODOS).target).toEqual({ kind: "new-main", anchor: "d", before: false });
    const leaves = [dash("d", "dg", "root"), leaf("x", "dg", project("B.md", "kanban")), note("n", "g", "x.md")];
    expect(planOpen(leaves, TODOS).target).toEqual({ kind: "tab-beside", id: "n" });
  });

  it("never opens into a sidebar", () => {
    const leaves = [note("n", "g", "x.md"), leaf("k", "sg", TODOS, { area: "right", activeTime: 999 })];
    expect(planOpen(leaves, TODOS).target).toEqual({ kind: "tab-beside", id: "n" });
  });
});

describe("planOpenNote", () => {
  it("reuses a tab showing the note, else navigates the most recent main tab", () => {
    const leaves = [note("a", "g", "y.md"), note("b", "g", "x.md")];
    expect(planOpenNote(leaves, "y.md")).toEqual({ kind: "leaf", id: "a" });
    expect(planOpenNote(leaves, "z.md")).toEqual({ kind: "leaf", id: "b" });
  });

  it("opens beside a pinned tab, and never over the dashboard", () => {
    expect(planOpenNote([note("n", "g", "x.md", { pinned: true })], "y.md")).toEqual({ kind: "tab-beside", id: "n" });
    const leaves = [dash("d", "dg", "root"), note("n", "dg", "x.md", { activeTime: 999 })];
    expect(planOpenNote(leaves, "x.md")).toEqual({ kind: "new-main", anchor: "n", before: false });
  });
});

describe("planDashboard", () => {
  it("opens as a tab in a sidebar's existing group, beside its most recent tab", () => {
    const leaves = [side("f", "g", "left"), side("s", "g", "left"), note("n", "m", "x.md")];
    expect(planDashboard(leaves, "left")).toEqual({
      kind: "place",
      target: { kind: "sidebar", side: "left", beside: "s" },
      detach: null,
    });
  });

  it("stays put as one tab among Files and Search", () => {
    expect(planDashboard([side("f", "g", "left"), dash("d", "g", "left")], "left")).toEqual({ kind: "focus", id: "d" });
  });

  it("stays put as the only thing in a sidebar", () => {
    expect(planDashboard([dash("d", "dg")], "right")).toEqual({ kind: "focus", id: "d" });
  });

  it("moves out of a stacked group of its own, in beside the sidebar's tabs (undoing the older stacked layout)", () => {
    const leaves = [dash("d", "dg"), side("o", "og")];
    expect(planDashboard(leaves, "right")).toEqual({
      kind: "place",
      target: { kind: "sidebar", side: "right", beside: "o" },
      detach: "d",
    });
  });

  it("moves between sidebars and into the main area", () => {
    const leaves = [dash("d", "dg", "left"), side("o", "og", "right"), note("n", "g", "x.md")];
    expect(planDashboard(leaves, "right")).toEqual({
      kind: "place",
      target: { kind: "sidebar", side: "right", beside: "o" },
      detach: "d",
    });
    expect(planDashboard(leaves, "pane")).toEqual({ kind: "place", target: { kind: "split", anchor: "n" }, detach: "d" });
  });

  it("in the main area, is alone in its group: takes a lone empty tab for Main area, splits for a pane", () => {
    const leaves = [leaf("e", "g", null, { empty: true })];
    expect(planDashboard(leaves, "main")).toEqual({ kind: "place", target: { kind: "reuse", id: "e" }, detach: null });
    expect(planDashboard(leaves, "pane")).toEqual({ kind: "place", target: { kind: "split", anchor: "e" }, detach: null });
    expect(planDashboard([dash("d", "dg", "root"), note("n", "g", "x.md")], "pane")).toEqual({ kind: "focus", id: "d" });
  });

  it("adds to an empty sidebar", () => {
    expect(planDashboard([], "right")).toEqual({
      kind: "place",
      target: { kind: "sidebar", side: "right", beside: null },
      detach: null,
    });
  });
});

describe("planEvictions", () => {
  it("moves a tab that landed in a main-area dashboard's group out as a new tab beside your notes", () => {
    const before = [dash("d", "dg", "root"), note("n", "g", "x.md")];
    const after = [...before, leaf("t", "dg", null, { empty: true })];
    expect(planEvictions(after, soleDashboardGroups(before))).toEqual([{ id: "t", target: { kind: "tab-beside", id: "n" } }]);
  });

  it("splits a new group off when the dashboard is all there is", () => {
    const sole = soleDashboardGroups([dash("d", "dg", "root")]);
    expect(planEvictions([dash("d", "dg", "root"), note("n", "dg", "x.md")], sole)).toEqual([
      { id: "n", target: { kind: "new-main", anchor: "n", before: false } },
    ]);
  });

  it("never moves a sidebar's own tabs", () => {
    const sole = soleDashboardGroups([dash("d", "dg")]);
    expect(planEvictions([dash("d", "dg"), side("o", "dg")], sole)).toEqual([]);
  });

  it("leaves alone notes you dragged the dashboard in among", () => {
    const leaves = [note("n", "g", "x.md"), dash("d", "g", "root")];
    expect(planEvictions(leaves, soleDashboardGroups(leaves))).toEqual([]);
  });
});

describe("paneDimensions", () => {
  it("sizes a child to the target and gives the rest to the others", () => {
    const dims = paneDimensions([800, 800], 0, 380)!;
    expect(dims[0]).toBeCloseTo((380 / 1600) * 100, 1);
    expect(dims[0] + dims[1]).toBeCloseTo(100, 1);
  });

  it("keeps the other children's proportions, and fixed children's size", () => {
    const dims = paneDimensions([400, 600, 1000], 0, 400)!;
    expect(dims[1] / dims[2]).toBeCloseTo(0.6, 2);
    const fixed = paneDimensions([300, 600, 600], 1, 380, { fixed: [0] })!;
    expect(fixed[0]).toBeCloseTo(20, 1);
  });

  it("clamps to a share of the split, or to an exact share when asked", () => {
    expect(paneDimensions([300, 300], 0, 380)![0]).toBeCloseTo(PANE_MAX_SHARE * 100, 1);
    expect(paneDimensions([2000, 2000], 1, 380)![1]).toBeCloseTo(PANE_MIN_SHARE * 100, 1);
    expect(paneDimensions([500, 500], 0, 600, { minShare: 0.6, maxShare: 0.6 })![0]).toBeCloseTo(60, 1);
  });

  it("returns null when there is nothing to size against", () => {
    expect(paneDimensions([1000], 0, 300)).toBeNull();
    expect(paneDimensions([0, 0], 0, 300)).toBeNull();
    expect(paneDimensions([500, 500], 2, 300)).toBeNull();
  });
});
