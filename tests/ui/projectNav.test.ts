import { describe, it, expect } from "vitest";
import {
  ARCHIVED_KEY,
  UNGROUPED_KEY,
  arrangeProjects,
  existingGroups,
  groupEdits,
  renameSectionKey,
  isProjectSort,
  isSectionOpen,
  looseOpenCount,
  projectCounts,
  sectionProjects,
  sortProjects,
  toggleSection,
  togglePin,
  type NavProject,
} from "../../src/ui/projectNav";
import { type TodoRecord } from "../../src/core/types";

function proj(name: string, over: Partial<NavProject> = {}): NavProject {
  return {
    name,
    path: `${name}.md`,
    group: null,
    archived: false,
    open: 0,
    overdue: 0,
    mtime: 0,
    ...over,
  };
}

function todo(over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "abcd1234",
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
    project: "P",
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
    ...over,
  };
}

const names = (ps: readonly { name: string }[]) => ps.map((p) => p.name);

describe("sortProjects", () => {
  const list = [
    proj("banana", { open: 1, mtime: 300 }),
    proj("Apple", { open: 5, mtime: 100 }),
    proj("cherry", { open: 5, mtime: 200 }),
  ];

  it("sorts by name case-insensitively", () => {
    expect(names(sortProjects(list, "name"))).toEqual(["Apple", "banana", "cherry"]);
  });

  it("sorts by open todos descending, name breaking the tie", () => {
    expect(names(sortProjects(list, "open"))).toEqual(["Apple", "cherry", "banana"]);
  });

  it("sorts by mtime descending", () => {
    expect(names(sortProjects(list, "recent"))).toEqual(["banana", "cherry", "Apple"]);
  });

  it("does not mutate its input", () => {
    const before = names(list);
    sortProjects(list, "open");
    expect(names(list)).toEqual(before);
  });

  it("recognizes only the three sort keys", () => {
    expect(isProjectSort("open")).toBe(true);
    expect(isProjectSort("size")).toBe(false);
    expect(isProjectSort(undefined)).toBe(false);
  });
});

describe("arrangeProjects", () => {
  const list = [proj("a"), proj("b"), proj("c")];

  it("splits pinned from the rest, both in sort order", () => {
    const { pinned, rest } = arrangeProjects(list, "name", ["c.md", "a.md"]);
    expect(names(pinned)).toEqual(["a", "c"]);
    expect(names(rest)).toEqual(["b"]);
  });

  it("ignores a pin whose path no longer exists (a renamed note drops its pin)", () => {
    const { pinned, rest } = arrangeProjects(list, "name", ["gone.md"]);
    expect(pinned).toEqual([]);
    expect(names(rest)).toEqual(["a", "b", "c"]);
  });
});

describe("sectionProjects", () => {
  const list = [
    proj("zeta", { group: "Work" }),
    proj("alpha", { group: "home" }),
    proj("beta", { group: "Work" }),
    proj("loose"),
    proj("old", { group: "Work", archived: true }),
  ];

  it("orders groups by name, ungrouped next, archived last", () => {
    const sections = sectionProjects(list, "name");
    expect(sections.map((s) => s.key)).toEqual(["home", "Work", UNGROUPED_KEY, ARCHIVED_KEY]);
    expect(sections.map((s) => s.label)).toEqual(["home", "Work", null, "Archived"]);
  });

  it("pulls archived projects out of their group", () => {
    const sections = sectionProjects(list, "name");
    expect(names(sections.find((s) => s.key === "Work")!.projects)).toEqual(["beta", "zeta"]);
    expect(names(sections.find((s) => s.key === ARCHIVED_KEY)!.projects)).toEqual(["old"]);
  });

  it("treats an empty-string group as ungrouped", () => {
    const sections = sectionProjects([proj("x", { group: "" })], "name");
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(UNGROUPED_KEY);
  });

  it("omits sections that would be empty", () => {
    expect(sectionProjects([proj("only", { group: "G" })], "name").map((s) => s.key)).toEqual(["G"]);
    expect(sectionProjects([], "name")).toEqual([]);
  });

  it("applies the sort within each section", () => {
    const sections = sectionProjects(
      [proj("a", { group: "G", open: 1 }), proj("b", { group: "G", open: 9 })],
      "open",
    );
    expect(names(sections[0].projects)).toEqual(["b", "a"]);
  });
});

describe("isSectionOpen / toggleSection", () => {
  const group = { key: "Work", label: "Work", projects: [], archived: false };
  const archived = { key: ARCHIVED_KEY, label: "Archived", projects: [], archived: true };

  it("opens groups and closes Archived by default", () => {
    expect(isSectionOpen(group, [])).toBe(true);
    expect(isSectionOpen(archived, [])).toBe(false);
  });

  it("reads the list as 'toggled away from the default', so it flips both ways", () => {
    expect(isSectionOpen(group, ["Work"])).toBe(false);
    expect(isSectionOpen(archived, [ARCHIVED_KEY])).toBe(true);
  });

  it("adds and removes a key without touching the others", () => {
    expect(toggleSection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSection(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("existingGroups", () => {
  it("de-duplicates case-insensitively, first spelling wins, name-ordered", () => {
    const groups = existingGroups([
      { group: "Work" },
      { group: "home" },
      { group: "work" },
      { group: null },
      { group: "   " },
    ]);
    expect(groups).toEqual(["home", "Work"]);
  });
});

describe("togglePin", () => {
  it("pins and unpins by path", () => {
    expect(togglePin([], "a.md")).toEqual(["a.md"]);
    expect(togglePin(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });
});

describe("projectCounts", () => {
  const today = "2026-09-15";

  it("counts open todos per project and ignores loose ones", () => {
    const counts = projectCounts(
      [todo({ project: "A" }), todo({ project: "A" }), todo({ project: "B" }), todo({ project: null })],
      today,
    );
    expect(counts.get("A")?.open).toBe(2);
    expect(counts.get("B")?.open).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("does not count DONE todos at all", () => {
    const counts = projectCounts([todo({ glyph: "x" }), todo({ glyph: "x", due: "2020-01-01" })], today);
    expect(counts.size).toBe(0);
  });

  it("counts every non-DONE status as open, blocked and paused included", () => {
    const counts = projectCounts([todo({ glyph: "!" }), todo({ glyph: "-" }), todo({ glyph: "/" })], today);
    expect(counts.get("P")?.open).toBe(3);
  });

  it("treats overdue as strictly before today — today's todo is not overdue", () => {
    const counts = projectCounts(
      [todo({ due: "2026-09-14" }), todo({ due: today }), todo({ due: "2026-09-16" }), todo()],
      today,
    );
    expect(counts.get("P")).toEqual({ open: 4, overdue: 1 });
  });
});

describe("looseOpenCount", () => {
  const todos = [
    todo({ project: null }),
    todo({ project: null, id: null }),
    todo({ project: null, glyph: "x" }),
    todo({ project: "A" }),
  ];

  it("counts open managed loose todos", () => {
    expect(looseOpenCount(todos, false)).toBe(1);
  });

  it("includes unmanaged checkboxes when the Inbox is set to show them", () => {
    expect(looseOpenCount(todos, true)).toBe(2);
  });
});

describe("groupEdits", () => {
  const projects = [
    { path: "A.md", group: "Work" },
    { path: "B.md", group: "Work" },
    { path: "C.md", group: null },
    { path: "D.md", group: "Home" },
  ];

  it("creates a group by naming its members, touching nobody else", () => {
    expect(groupEdits(projects, null, "Side", new Set(["C.md"]))).toEqual([{ path: "C.md", group: "Side" }]);
  });

  it("renames a group by rewriting only its members", () => {
    expect(groupEdits(projects, "Work", "Job", new Set(["A.md", "B.md"]))).toEqual([
      { path: "A.md", group: "Job" },
      { path: "B.md", group: "Job" },
    ]);
  });

  it("ungroups members taken out, and moves members brought in from another group", () => {
    expect(groupEdits(projects, "Work", "Work", new Set(["A.md", "D.md"]))).toEqual([
      { path: "B.md", group: null },
      { path: "D.md", group: "Work" },
    ]);
  });

  it("deletes a group by ungrouping every member", () => {
    expect(groupEdits(projects, "Work", null, new Set(["A.md", "C.md"]))).toEqual([
      { path: "A.md", group: null },
      { path: "B.md", group: null },
    ]);
  });

  it("trims the name, and treats a blank one as a delete", () => {
    expect(groupEdits(projects, "Home", "  Family ", new Set(["D.md"]))).toEqual([{ path: "D.md", group: "Family" }]);
    expect(groupEdits(projects, "Home", "   ", new Set(["D.md"]))).toEqual([{ path: "D.md", group: null }]);
  });

  it("is a no-op when nothing changes", () => {
    expect(groupEdits(projects, "Work", "Work", new Set(["A.md", "B.md"]))).toEqual([]);
  });
});

describe("renameSectionKey", () => {
  it("carries a collapsed group across a rename", () => {
    expect(renameSectionKey(["Work", "x"], "Work", "Job")).toEqual(["x", "Job"]);
  });
  it("drops it on delete, and leaves an expanded group alone", () => {
    expect(renameSectionKey(["Work"], "Work", null)).toEqual([]);
    expect(renameSectionKey(["x"], "Work", "Job")).toEqual(["x"]);
  });
});
