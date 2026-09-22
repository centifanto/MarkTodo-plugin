import { describe, it, expect } from "vitest";
import {
  buildColumns,
  buildListGroups,
  buildStatusSections,
} from "../../src/obsidian/viewData";
import { STATUS_LABELS, STATUS_ORDER, type TodoRecord } from "../../src/core/types";
import { DEFAULT_FOCUS } from "../../src/ui/focus";

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

describe("Done is always newest-completed first", () => {
  const done = (text: string, line: number): TodoRecord =>
    rec("x", { displayText: text, line, id: `d${line}` });

  it("orders the Done section by its `done @` stamp, ignoring the chosen sort", () => {
    const todos = [
      done("oldest done @ 2026-09-01", 0),
      done("newest done @ 2026-09-20", 1),
      done("middle done @ 2026-09-10", 2),
    ];
    for (const sort of ["manual", "title", "priority"] as const) {
      const section = buildStatusSections(todos, DEFAULT_FOCUS, sort).find((g) => g.status === "DONE");
      expect(section?.todos.map((t) => t.displayText.split(" ")[0]), sort).toEqual([
        "newest",
        "middle",
        "oldest",
      ]);
    }
  });

  it("drops an unstamped done todo to the bottom", () => {
    const todos = [done("unstamped", 0), done("stamped done @ 2026-09-01", 1)];
    const section = buildStatusSections(todos).find((g) => g.status === "DONE");
    expect(section?.todos.map((t) => t.displayText.split(" ")[0])).toEqual(["stamped", "unstamped"]);
  });

  it("orders the board's Done column the same way", () => {
    const todos = [
      done("oldest done @ 2026-09-01", 0),
      done("newest done @ 2026-09-20", 1),
    ];
    const column = buildColumns(todos).find((c) => c.status === "DONE");
    expect(column?.cards.map((c) => c.todo.displayText.split(" ")[0])).toEqual(["newest", "oldest"]);
  });

  it("leaves every other status on the chosen sort", () => {
    const todos = [
      rec("/", { displayText: "b", line: 0, id: "a" }),
      rec("/", { displayText: "a", line: 1, id: "b" }),
    ];
    const doing = buildStatusSections(todos, DEFAULT_FOCUS, "title").find((g) => g.status === "PROGRESS");
    expect(doing?.todos.map((t) => t.displayText)).toEqual(["a", "b"]);
  });
});

describe("buildColumns", () => {
  it("excludes untriaged (project-null) todos from every column", () => {
    const todos = [
      rec(" ", { id: "inbox1", project: null }),
      rec("x", { id: "stray1", project: null }),
      rec(" ", { id: "proj1" }),
    ];
    const cols = buildColumns(todos);
    const allIds = cols.flatMap((c) => c.cards.map((card) => card.todo.id));
    expect(allIds).toEqual(["proj1"]);
  });

  it("returns all statuses in order, placing cards by glyph, keeping empties", () => {
    const todos = [rec("/", { id: "a" }), rec("/", { id: "b" }), rec("x", { id: "c" })];
    const cols = buildColumns(todos);
    expect(cols.map((c) => c.status)).toEqual([...STATUS_ORDER]);
    const progress = cols.find((c) => c.status === "PROGRESS")!;
    const done = cols.find((c) => c.status === "DONE")!;
    const backlog = cols.find((c) => c.status === "BACKLOG")!;
    expect(progress.cards.map((c) => c.todo.id)).toEqual(["a", "b"]);
    expect(done.cards.map((c) => c.todo.id)).toEqual(["c"]);
    expect(backlog.cards).toHaveLength(0);
  });

  it("uses filePath:line as the card id for unmanaged todos", () => {
    const cols = buildColumns([rec(" ", { id: null, file: "N.md", line: 7 })]);
    const backlog = cols.find((c) => c.status === "BACKLOG")!;
    expect(backlog.cards[0].id).toBe("N.md:7");
  });
});

describe("buildListGroups", () => {
  it("groups by status with labels in STATUS_ORDER, skipping empties", () => {
    const todos = [rec(" ", { id: "a" }), rec("x", { id: "b" })];
    const groups = buildListGroups(todos, "status");
    expect(groups.map((g) => g.label)).toEqual(["Backlog", "Done"]);
    // Status groups carry their status so the "+" can preset it.
    expect(groups.map((g) => g.status)).toEqual(["BACKLOG", "DONE"]);
  });

  it("groups by subproject, mapping null to (none)", () => {
    const todos = [
      rec(" ", { id: "a", subproject: "Kitchen" }),
      rec(" ", { id: "b", subproject: null }),
    ];
    const groups = buildListGroups(todos, "subproject");
    expect(groups.map((g) => g.label)).toEqual(["Kitchen", "(none)"]);
  });

  it("groups by note: path label without .md, linked file, sorted, todos in line order", () => {
    const todos = [
      rec(" ", { id: "b2", file: "Daily/2026-09-13.md", line: 9 }),
      rec(" ", { id: "a1", file: "Areas/Garden.md", line: 2 }),
      rec("x", { id: "b1", file: "Daily/2026-09-13.md", line: 4 }),
    ];
    const groups = buildListGroups(todos, "note");
    expect(groups.map((g) => [g.label, g.file])).toEqual([
      ["Areas/Garden", "Areas/Garden.md"],
      ["Daily/2026-09-13", "Daily/2026-09-13.md"],
    ]);
    expect(groups[1].todos.map((t) => t.id)).toEqual(["b1", "b2"]);
  });
});

describe("buildStatusSections — the within-status sort", () => {
  const backlog = (title: string, over: Partial<TodoRecord> = {}) =>
    rec(" ", { displayText: title, ...over });

  it("defaults to file order, so a fresh list reads as the note does", () => {
    const todos = [backlog("z", { line: 1 }), backlog("a", { line: 2 })];
    const section = buildStatusSections(todos)[0];
    expect(section.todos.map((t) => t.displayText)).toEqual(["z", "a"]);
  });

  it("orders inside a status when asked", () => {
    const todos = [
      backlog("later", { due: "2026-09-20", line: 1 }),
      backlog("soon", { due: "2026-09-10", line: 2 }),
    ];
    const section = buildStatusSections(todos, "all", "due")[0];
    expect(section.todos.map((t) => t.displayText)).toEqual(["soon", "later"]);
  });

  // The invariant worth guarding: a sort reorders rows, it never regroups them.
  // A todo that changed section would be a regrouping wearing a sort's name.
  it("never moves a todo out of its own status", () => {
    const todos = [
      rec("/", { id: "doing", due: "2026-12-01" }),
      rec(" ", { id: "backlog", due: "2026-01-01" }),
      rec("x", { id: "done", due: "2026-06-01" }),
    ];
    for (const sort of ["manual", "due", "priority", "title", "project"] as const) {
      const byStatus = Object.fromEntries(
        buildStatusSections(todos, "all", sort).map((s) => [s.status, s.todos.map((t) => t.id)]),
      );
      expect(byStatus, sort).toMatchObject({
        BACKLOG: ["backlog"],
        PROGRESS: ["doing"],
        DONE: ["done"],
      });
    }
  });
});

describe("buildStatusSections", () => {
  it("has every status in column order, empty ones included", () => {
    const sections = buildStatusSections([rec(" ", { id: "a" })]);
    expect(sections.map((s) => s.status)).toEqual([...STATUS_ORDER]);
    expect(sections.map((s) => s.label)).toEqual(STATUS_ORDER.map((st) => STATUS_LABELS[st]));
    expect(sections.find((s) => s.status === "BACKLOG")!.todos.map((t) => t.id)).toEqual(["a"]);
    expect(sections.find((s) => s.status === "DONE")!.todos).toEqual([]);
  });

  it("keeps the incoming order within a section", () => {
    const todos = [rec(" ", { id: "b", line: 9 }), rec(" ", { id: "a", line: 1 })];
    const [backlog] = buildStatusSections(todos);
    expect(backlog.todos.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
