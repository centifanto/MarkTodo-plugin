import { describe, it, expect } from "vitest";
import {
  activeFilterCount,
  filterByState,
  filterStateToScope,
  groupOptions,
  isFilterActive,
  matchOptions,
  projectOptions,
  reconcileFilterState,
  tagOptions,
  type FilterState,
} from "../../src/obsidian/filterLogic";
import { type TodoRecord } from "../../src/core/types";

function rec(over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "id1",
    glyph: " ",
    priority: "NONE",
    displayText: "todo",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    file: "F.md",
    line: 0,
    project: null,
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
    ...over,
  };
}

const TODOS = [
  rec({ project: "Home Reno", tags: ["reno"] }),
  rec({ project: "Q4 Launch", tags: ["work", "reno"] }),
  rec({ project: null, file: "Inbox.md", tags: ["errand"] }),
];

describe("projectOptions", () => {
  it("lists projects only on List/Kanban and dashboards", () => {
    const expected = [
      ["Home Reno", "Home Reno"],
      ["Q4 Launch", "Q4 Launch"],
    ];
    expect(projectOptions(TODOS, "projects")).toEqual(expected);
    expect(projectOptions(TODOS, "any")).toEqual(expected);
  });

  it("offers no project picker on the loose (Inbox) surface", () => {
    expect(projectOptions(TODOS, "loose")).toEqual([]);
  });
});

describe("tagOptions", () => {
  it("lists distinct tags, sorted, displayed with #", () => {
    expect(tagOptions(TODOS)).toEqual([
      ["errand", "#errand"],
      ["reno", "#reno"],
      ["work", "#work"],
    ]);
  });
});

describe("reconcileFilterState", () => {
  it("drops the retired ::inbox:: sentinel restored from memory", () => {
    const s: FilterState = { project: "::inbox::", priority: "HIGH" };
    expect(reconcileFilterState(s, TODOS, "projects")).toBe(true);
    expect(s).toEqual({ project: undefined, priority: "HIGH" });
  });

  it("drops any project selection on the loose surface", () => {
    const s: FilterState = { project: "Home Reno" };
    expect(reconcileFilterState(s, TODOS, "loose")).toBe(true);
    expect(s.project).toBeUndefined();
  });

  it("drops a deleted project and a vanished tag", () => {
    const s: FilterState = { project: "Old Project", tag: "gone" };
    expect(reconcileFilterState(s, TODOS, "projects")).toBe(true);
    expect(s).toEqual({ project: undefined, tag: undefined });
  });

  it("leaves valid selections alone", () => {
    const s: FilterState = { project: "Q4 Launch", tag: "work" };
    expect(reconcileFilterState(s, TODOS, "projects")).toBe(false);
    expect(s).toEqual({ project: "Q4 Launch", tag: "work" });
  });
});

describe("matchOptions", () => {
  const opts = [
    ["a", "Home Reno"],
    ["b", "Q4 Launch"],
    ["c", "Renovate shed"],
  ] as const;

  it("returns everything for an empty query", () => {
    expect(matchOptions(opts, "  ")).toEqual([...opts]);
  });

  it("ranks prefix matches before substring matches, case-insensitively", () => {
    expect(matchOptions(opts, "REN").map(([v]) => v)).toEqual(["c", "a"]);
  });

  it("ignores a leading # on both the query and tag displays", () => {
    const tags = [
      ["reno", "#reno"],
      ["work", "#work"],
    ] as const;
    expect(matchOptions(tags, "#wo")).toEqual([["work", "#work"]]);
    expect(matchOptions(tags, "re")).toEqual([["reno", "#reno"]]);
  });

  it("returns nothing when no option matches", () => {
    expect(matchOptions(opts, "zzz")).toEqual([]);
  });
});

describe("filterByState — surfaces", () => {
  const todos = [
    rec({ id: "p1", project: "Home Reno", file: "Home Reno.md" }),
    rec({ id: "in1", file: "Inbox.md" }),
    rec({ id: "lo1", file: "Daily/2026-09-13.md", glyph: "x" }),
    rec({ id: null, file: "Daily/2026-09-13.md", line: 3 }),
  ];
  const ids = (ts: readonly { id: string | null }[]) => ts.map((t) => t.id);

  it("List/Kanban see project todos only — an Inbox.md is not special", () => {
    expect(ids(filterByState(todos, {}, "projects"))).toEqual(["p1"]);
  });

  it("the loose (Inbox view) surface sees every non-project todo", () => {
    expect(ids(filterByState(todos, {}, "loose"))).toEqual(["in1", "lo1", null]);
    expect(ids(filterByState(todos, { managed: true }, "loose"))).toEqual(["in1", "lo1"]);
  });

  it("dashboards (any) keep everything their scope allows", () => {
    expect(filterByState(todos, {}, "any")).toHaveLength(4);
    expect(ids(filterByState(todos, { project: "Home Reno" }, "any"))).toEqual(["p1"]);
  });
});

describe("filterStateToScope / isFilterActive", () => {
  it("maps the loose surface to noProject", () => {
    expect(filterStateToScope({ tag: "x" }, "loose")).toMatchObject({ noProject: true, tags: ["x"] });
    expect(filterStateToScope({ project: "A" }, "projects")).toMatchObject({
      projects: ["A"],
      noProject: undefined,
    });
  });

  it("is inactive with no selections (Clear stays hidden)", () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ managed: false })).toBe(true);
  });
});

describe("activeFilterCount (collapsed bar badge)", () => {
  it("counts each set filter, including managed=false", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ project: "A", managed: false })).toBe(2);
    expect(activeFilterCount({ project: "A", tag: "t", priority: "HIGH", managed: true })).toBe(4);
  });
});

// ── The group picker and the archived toggle ────────────────────────────────

describe("groupOptions", () => {
  const todos = [
    rec({ project: "Work A", projectGroup: "Work" }),
    rec({ project: "Work B", projectGroup: "Work" }),
    rec({ project: "Reno", projectGroup: "Home" }),
    rec({ project: "Stray", projectGroup: null }),
  ];

  it("lists each group once, sorted, ungrouped excluded", () => {
    expect(groupOptions(todos)).toEqual([
      ["Home", "Home"],
      ["Work", "Work"],
    ]);
  });

  it("is empty when nothing is grouped", () => {
    expect(groupOptions([rec({ projectGroup: null })])).toEqual([]);
  });
});

describe("filterStateToScope — group and archived keys", () => {
  it("maps a chosen group into the scope", () => {
    expect(filterStateToScope({ group: "Work" }).groups).toEqual(["Work"]);
    expect(filterStateToScope({}).groups).toBeUndefined();
  });

  it("passes showArchived through only when it is on", () => {
    expect(filterStateToScope({ showArchived: true }).includeArchived).toBe(true);
    expect(filterStateToScope({ showArchived: false }).includeArchived).toBeUndefined();
    expect(filterStateToScope({}).includeArchived).toBeUndefined();
  });
});

describe("activeFilterCount — group and archived", () => {
  it("counts a group like any other narrowing filter", () => {
    expect(activeFilterCount({ group: "Work" })).toBe(1);
    expect(activeFilterCount({ group: "Work", tag: "reno" })).toBe(2);
  });

  it("does NOT count showArchived — it widens the view, it does not narrow it", () => {
    expect(activeFilterCount({ showArchived: true })).toBe(0);
    expect(isFilterActive({ showArchived: true })).toBe(false);
  });
});

describe("reconcileFilterState — groups", () => {
  it("drops a group that no longer exists in view", () => {
    const state = { group: "Retired" };
    expect(reconcileFilterState(state, [rec({ projectGroup: "Work" })], "projects")).toBe(true);
    expect(state.group).toBeUndefined();
  });

  it("keeps a group that is still there", () => {
    const state = { group: "Work" };
    expect(reconcileFilterState(state, [rec({ projectGroup: "Work" })], "projects")).toBe(false);
    expect(state.group).toBe("Work");
  });
});
