import { describe, it, expect } from "vitest";
import {
  buildColumns,
  buildListGroups,
  buildStatusSections,
} from "../../src/obsidian/viewData";
import {
  DEFAULT_STATUS_LABELS,
  STATUS_ORDER,
  type TodoRecord,
} from "../../src/core/types";

function rec(glyph: string, over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "id" + Math.round(0), // placeholder; overridden below where needed
    glyph,
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
    // Boards only show project todos, so the fixture defaults to one;
    // tests for the untriaged exclusion override this back to null explicitly.
    project: "P",
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
    ...over,
  };
}

describe("buildColumns", () => {
  it("excludes untriaged (project-null) todos from every column", () => {
    const todos = [
      rec(" ", { id: "inbox1", project: null }),
      rec("x", { id: "stray1", project: null }),
      rec(" ", { id: "proj1" }),
    ];
    const cols = buildColumns(todos, STATUS_ORDER, DEFAULT_STATUS_LABELS);
    const allIds = cols.flatMap((c) => c.cards.map((card) => card.todo.id));
    expect(allIds).toEqual(["proj1"]);
  });

  it("returns all statuses in order, placing cards by glyph, keeping empties", () => {
    const todos = [rec("/", { id: "a" }), rec("/", { id: "b" }), rec("x", { id: "c" })];
    const cols = buildColumns(todos, STATUS_ORDER, DEFAULT_STATUS_LABELS);
    expect(cols.map((c) => c.status)).toEqual([...STATUS_ORDER]);
    const progress = cols.find((c) => c.status === "PROGRESS")!;
    const done = cols.find((c) => c.status === "DONE")!;
    const backlog = cols.find((c) => c.status === "BACKLOG")!;
    expect(progress.cards.map((c) => c.todo.id)).toEqual(["a", "b"]);
    expect(done.cards.map((c) => c.todo.id)).toEqual(["c"]);
    expect(backlog.cards).toHaveLength(0);
  });

  it("uses filePath:line as the card id for unmanaged todos", () => {
    const cols = buildColumns([rec(" ", { id: null, file: "N.md", line: 7 })], STATUS_ORDER, DEFAULT_STATUS_LABELS);
    const backlog = cols.find((c) => c.status === "BACKLOG")!;
    expect(backlog.cards[0].id).toBe("N.md:7");
  });
});

describe("buildListGroups", () => {
  it("groups by status with labels in STATUS_ORDER, skipping empties", () => {
    const todos = [rec(" ", { id: "a" }), rec("x", { id: "b" })];
    const groups = buildListGroups(todos, "status", DEFAULT_STATUS_LABELS);
    expect(groups.map((g) => g.label)).toEqual(["Backlog", "Done"]);
    // Status groups carry their status so the "+" can preset it.
    expect(groups.map((g) => g.status)).toEqual(["BACKLOG", "DONE"]);
  });

  it("groups by subproject, mapping null to (none)", () => {
    const todos = [
      rec(" ", { id: "a", subproject: "Kitchen" }),
      rec(" ", { id: "b", subproject: null }),
    ];
    const groups = buildListGroups(todos, "subproject", DEFAULT_STATUS_LABELS);
    expect(groups.map((g) => g.label)).toEqual(["Kitchen", "(none)"]);
  });

  it("groups by note: path label without .md, linked file, sorted, todos in line order", () => {
    const todos = [
      rec(" ", { id: "b2", file: "Daily/2026-09-13.md", line: 9 }),
      rec(" ", { id: "a1", file: "Areas/Garden.md", line: 2 }),
      rec("x", { id: "b1", file: "Daily/2026-09-13.md", line: 4 }),
    ];
    const groups = buildListGroups(todos, "note", DEFAULT_STATUS_LABELS);
    expect(groups.map((g) => [g.label, g.file])).toEqual([
      ["Areas/Garden", "Areas/Garden.md"],
      ["Daily/2026-09-13", "Daily/2026-09-13.md"],
    ]);
    expect(groups[1].todos.map((t) => t.id)).toEqual(["b1", "b2"]);
  });
});

describe("buildStatusSections", () => {
  it("has every status in the given order, empty ones included", () => {
    const order = ["DONE", "BACKLOG", "WARMING", "PROGRESS", "BLOCKED", "PAUSED"] as const;
    const sections = buildStatusSections([rec(" ", { id: "a" })], order, DEFAULT_STATUS_LABELS);
    expect(sections.map((s) => s.status)).toEqual(order);
    expect(sections.find((s) => s.status === "BACKLOG")!.todos.map((t) => t.id)).toEqual(["a"]);
    expect(sections.find((s) => s.status === "DONE")!.todos).toEqual([]);
    expect(sections[0].label).toBe(DEFAULT_STATUS_LABELS.DONE);
  });

  it("keeps the incoming order within a section", () => {
    const todos = [rec(" ", { id: "b", line: 9 }), rec(" ", { id: "a", line: 1 })];
    const [backlog] = buildStatusSections(todos, STATUS_ORDER, DEFAULT_STATUS_LABELS);
    expect(backlog.todos.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
