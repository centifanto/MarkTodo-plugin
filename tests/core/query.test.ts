import { describe, it, expect } from "vitest";
import { filterTodos, groupTodos, type QueryScope } from "../../src/core/query";
import {
  type Priority,
  type Status,
  type TodoRecord,
  STATUS_GLYPH,
} from "../../src/core/types";

/** Build a TodoRecord from partial overrides, filling all required fields. */
function makeTodo(overrides: Partial<TodoRecord> = {}): TodoRecord {
  const base: TodoRecord = {
    id: "abcd1234",
    glyph: STATUS_GLYPH.BACKLOG,
    priority: "NONE",
    displayText: "a todo",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    file: "Projects/Alpha.md",
    line: 0,
    project: "Alpha",
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
  };
  return { ...base, ...overrides };
}

/** Convenience: a managed todo whose glyph encodes the given status. */
function withStatus(status: Status, overrides: Partial<TodoRecord> = {}) {
  return makeTodo({ glyph: STATUS_GLYPH[status], ...overrides });
}

describe("filterTodos", () => {
  it("filters by tags with OR within the list (case-sensitive, no leading #)", () => {
    const todos = [
      makeTodo({ tags: ["home"] }),
      makeTodo({ tags: ["work", "urgent"] }),
      makeTodo({ tags: ["errand"] }),
      makeTodo({ tags: ["Home"] }), // different case -> excluded
      makeTodo({ tags: [] }),
    ];
    const out = filterTodos(todos, { tags: ["home", "work"] });
    expect(out).toEqual([todos[0], todos[1]]);
  });

  it("noProject keeps only todos outside any project (the Inbox/untriaged scope)", () => {
    const todos = [
      makeTodo({ project: "Alpha" }),
      makeTodo({ project: null, file: "Inbox.md" }),
      makeTodo({ project: null, file: "Stray.md" }),
    ];
    expect(filterTodos(todos, { noProject: true })).toEqual([todos[1], todos[2]]);
    // undefined/false leaves the scope untouched
    expect(filterTodos(todos, {})).toEqual(todos);
  });

  it("filters by projects; null project never matches", () => {
    const todos = [
      makeTodo({ project: "Alpha" }),
      makeTodo({ project: "Beta" }),
      makeTodo({ project: null }),
      makeTodo({ project: "Gamma" }),
    ];
    const out = filterTodos(todos, { projects: ["Alpha", "Gamma"] });
    expect(out).toEqual([todos[0], todos[3]]);
  });

  it("filters by status via statusOf(todo)", () => {
    const todos = [
      withStatus("BACKLOG"),
      withStatus("PROGRESS"),
      withStatus("DONE"),
      withStatus("PROGRESS"),
    ];
    const out = filterTodos(todos, { status: ["PROGRESS"] });
    expect(out).toEqual([todos[1], todos[3]]);
  });

  it("filters by priority", () => {
    const todos = [
      makeTodo({ priority: "URGENT" }),
      makeTodo({ priority: "LOW" }),
      makeTodo({ priority: "NONE" }),
      makeTodo({ priority: "URGENT" }),
    ];
    const out = filterTodos(todos, { priority: ["URGENT", "LOW"] });
    expect(out).toEqual([todos[0], todos[1], todos[3]]);
  });

  it("ANDs across keys: status AND priority both must match", () => {
    const todos = [
      withStatus("PROGRESS", { priority: "URGENT" }), // match
      withStatus("PROGRESS", { priority: "LOW" }), // wrong priority
      withStatus("DONE", { priority: "URGENT" }), // wrong status
      withStatus("PROGRESS", { priority: "URGENT" }), // match
    ];
    const out = filterTodos(todos, {
      status: ["PROGRESS"],
      priority: ["URGENT"],
    });
    expect(out).toEqual([todos[0], todos[3]]);
  });

  it("treats an empty array the same as an omitted key (no filtering)", () => {
    const todos = [
      makeTodo({ tags: ["a"], priority: "LOW" }),
      makeTodo({ tags: [], priority: "NONE" }),
    ];
    const emptyScope: QueryScope = {
      tags: [],
      projects: [],
      status: [],
      priority: [],
    };
    expect(filterTodos(todos, emptyScope)).toEqual(todos);
    expect(filterTodos(todos, {})).toEqual(todos);
  });

  it("managed: true keeps id !== null; false keeps id === null; omitted keeps both", () => {
    const managed = makeTodo({ id: "deadbeef" });
    const unmanaged = makeTodo({ id: null });
    const todos = [managed, unmanaged];

    expect(filterTodos(todos, { managed: true })).toEqual([managed]);
    expect(filterTodos(todos, { managed: false })).toEqual([unmanaged]);
    expect(filterTodos(todos, {})).toEqual(todos);
  });

  it("preserves input order and does not mutate the input array", () => {
    const todos = [
      makeTodo({ priority: "URGENT", displayText: "1" }),
      makeTodo({ priority: "NONE", displayText: "2" }),
      makeTodo({ priority: "URGENT", displayText: "3" }),
    ];
    const snapshot = [...todos];
    const out = filterTodos(todos, { priority: ["URGENT"] });
    expect(out).toEqual([todos[0], todos[2]]);
    expect(out).not.toBe(todos);
    expect(todos).toEqual(snapshot); // input untouched
  });
});

describe("groupTodos by status", () => {
  it("orders keys by STATUS_ORDER, skips empty statuses, preserves within-group order", () => {
    const todos = [
      withStatus("DONE", { displayText: "d1" }),
      withStatus("BACKLOG", { displayText: "b1" }),
      withStatus("PROGRESS", { displayText: "p1" }),
      withStatus("BACKLOG", { displayText: "b2" }),
      withStatus("DONE", { displayText: "d2" }),
    ];
    const grouped = groupTodos(todos, "status");

    // Only populated statuses, in STATUS_ORDER (BACKLOG, PROGRESS, DONE).
    expect([...grouped.keys()]).toEqual(["BACKLOG", "PROGRESS", "DONE"]);
    expect(grouped.get("BACKLOG")!.map((t) => t.displayText)).toEqual([
      "b1",
      "b2",
    ]);
    expect(grouped.get("PROGRESS")!.map((t) => t.displayText)).toEqual(["p1"]);
    expect(grouped.get("DONE")!.map((t) => t.displayText)).toEqual([
      "d1",
      "d2",
    ]);
    expect(grouped.has("WARMING")).toBe(false);
  });

  it("does not mutate the input array", () => {
    const todos = [withStatus("PROGRESS"), withStatus("BACKLOG")];
    const snapshot = [...todos];
    groupTodos(todos, "status");
    expect(todos).toEqual(snapshot);
  });
});

describe("groupTodos by subproject", () => {
  it("uses first-appearance order, maps null to (none), and puts (none) LAST", () => {
    const todos = [
      makeTodo({ subproject: "API", displayText: "a1" }),
      makeTodo({ subproject: null, displayText: "n1" }),
      makeTodo({ subproject: "UI", displayText: "u1" }),
      makeTodo({ subproject: "API", displayText: "a2" }),
      makeTodo({ subproject: null, displayText: "n2" }),
    ];
    const grouped = groupTodos(todos, "subproject");

    // First-appearance for named buckets, "(none)" forced to the end.
    expect([...grouped.keys()]).toEqual(["API", "UI", "(none)"]);
    expect(grouped.get("API")!.map((t) => t.displayText)).toEqual(["a1", "a2"]);
    expect(grouped.get("UI")!.map((t) => t.displayText)).toEqual(["u1"]);
    expect(grouped.get("(none)")!.map((t) => t.displayText)).toEqual([
      "n1",
      "n2",
    ]);
  });

  it("keeps (none) in place when it is the only bucket", () => {
    const todos = [
      makeTodo({ subproject: null, displayText: "x" }),
      makeTodo({ subproject: null, displayText: "y" }),
    ];
    const grouped = groupTodos(todos, "subproject");
    expect([...grouped.keys()]).toEqual(["(none)"]);
    expect(grouped.get("(none)")!.map((t) => t.displayText)).toEqual([
      "x",
      "y",
    ]);
  });

  it("returns an empty Map for empty input", () => {
    expect(groupTodos([], "subproject").size).toBe(0);
    expect(groupTodos([], "status").size).toBe(0);
  });
});

// Reference the Priority type so the import is unambiguous in strict mode.
const _priorityCheck: Priority = "HIGH";
void _priorityCheck;

// ── Groups narrow, archived disappears ──────────────────────────────────────

describe("filterTodos — groups", () => {
  const todos = [
    makeTodo({ id: "w1", project: "Work A", projectGroup: "Work" }),
    makeTodo({ id: "w2", project: "Work B", projectGroup: "Work" }),
    makeTodo({ id: "h1", project: "Home", projectGroup: "Home" }),
    makeTodo({ id: "u1", project: "Loose Project", projectGroup: null }),
  ];

  it("narrows to the projects in a group", () => {
    expect(filterTodos(todos, { groups: ["Work"] }).map((t) => t.id)).toEqual(["w1", "w2"]);
  });

  it("ORs within the list, like every other scope key", () => {
    expect(filterTodos(todos, { groups: ["Work", "Home"] }).map((t) => t.id)).toEqual([
      "w1",
      "w2",
      "h1",
    ]);
  });

  it("never matches an ungrouped todo", () => {
    expect(filterTodos(todos, { groups: ["Work"] }).some((t) => t.id === "u1")).toBe(false);
  });

  it("an empty or omitted list does not filter", () => {
    expect(filterTodos(todos, { groups: [] })).toHaveLength(4);
    expect(filterTodos(todos, {})).toHaveLength(4);
  });
});

describe("filterTodos — archived", () => {
  const todos = [
    makeTodo({ id: "live", archived: false }),
    makeTodo({ id: "old", archived: true }),
  ];

  it("hides archived todos by default — that is what archiving is for", () => {
    expect(filterTodos(todos, {}).map((t) => t.id)).toEqual(["live"]);
  });

  it("includes them when asked", () => {
    expect(filterTodos(todos, { includeArchived: true }).map((t) => t.id)).toEqual([
      "live",
      "old",
    ]);
  });

  it("still applies the other keys when archived are included", () => {
    const mixed = [
      makeTodo({ id: "a", archived: true, projectGroup: "Work", project: "W" }),
      makeTodo({ id: "b", archived: true, projectGroup: "Home", project: "H" }),
    ];
    expect(
      filterTodos(mixed, { includeArchived: true, groups: ["Work"] }).map((t) => t.id),
    ).toEqual(["a"]);
  });
});
