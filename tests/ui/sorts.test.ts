import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIST_SORT,
  TODO_SORTS,
  isManualSort,
  parseSort,
  sortOptions,
  sortTodos,
  type SortContext,
  type SortKey,
  type SortSurface,
} from "../../src/ui/sorts";
import { type TodoRecord } from "../../src/core/types";

function todo(text: string, over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: null,
    glyph: " ",
    priority: "NONE",
    displayText: text,
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

/** A list surface: orders on the due date, soonest first. */
const ctx: SortContext = { dateOf: (t) => t.due, newestFirst: false };
const titles = (todos: readonly TodoRecord[]) => todos.map((t) => t.displayText);

describe("the registry is the single source", () => {
  // These are the guard rails on "adding a sort is one row and nothing else":
  // if a row can exist that no surface offers, or that the picker can't label,
  // the table has stopped being the whole truth.
  it("gives every sort a label and at least one surface", () => {
    for (const [key, def] of Object.entries(TODO_SORTS)) {
      expect(def.label, key).toBeTruthy();
      expect(def.on.length, key).toBeGreaterThan(0);
    }
  });

  it("offers every row on the surfaces its own `on` names, and no others", () => {
    for (const surface of ["list", "agenda"] as SortSurface[]) {
      const offered = sortOptions(surface, true).map((o) => o.key);
      const expected = (Object.entries(TODO_SORTS) as Array<[SortKey, { on: readonly string[] }]>)
        .filter(([, def]) => def.on.includes(surface))
        .map(([key]) => key);
      expect(offered, surface).toEqual(expected);
    }
  });

  it("starts a list on Manual — the only sort dragging can write back", () => {
    expect(DEFAULT_LIST_SORT).toBe("manual");
    expect(isManualSort("manual")).toBe(true);
    expect(isManualSort("due")).toBe(false);
  });

  it("holds back the Project sort where only one project is on screen", () => {
    expect(sortOptions("list", true).map((o) => o.key)).toContain("project");
    expect(sortOptions("list", false).map((o) => o.key)).not.toContain("project");
    // Everything else is unaffected by the narrowing.
    expect(sortOptions("list", false).map((o) => o.key)).toEqual([
      "manual",
      "due",
      "priority",
      "title",
    ]);
  });

  it("falls back for a stored sort the surface can't offer", () => {
    expect(parseSort("due", "list", "manual")).toBe("due");
    // "manual" is a list sort; Agenda has no such row.
    expect(parseSort("manual", "agenda", "date")).toBe("date");
    expect(parseSort("nonsense", "list", "manual")).toBe("manual");
    expect(parseSort(undefined, "list", "manual")).toBe("manual");
  });
});

describe("sortTodos", () => {
  it("leaves the todos alone under Manual — file order is what the note says", () => {
    const todos = [todo("z", { line: 9 }), todo("a", { line: 2 })];
    expect(titles(sortTodos(todos, "manual", ctx))).toEqual(["z", "a"]);
  });

  it("orders by date soonest first, undated last", () => {
    const todos = [todo("none"), todo("later", { due: "2026-09-20" }), todo("soon", { due: "2026-09-10" })];
    expect(titles(sortTodos(todos, "due", ctx))).toEqual(["soon", "later", "none"]);
  });

  it("reverses for a newest-first surface (Recent)", () => {
    const todos = [todo("older", { due: "2026-09-10" }), todo("newer", { due: "2026-09-20" })];
    const recent: SortContext = { dateOf: (t) => t.due, newestFirst: true };
    expect(titles(sortTodos(todos, "due", recent))).toEqual(["newer", "older"]);
  });

  it("orders by priority URGENT → NONE", () => {
    const todos = [todo("none"), todo("low", { priority: "LOW" }), todo("urgent", { priority: "URGENT" })];
    expect(titles(sortTodos(todos, "priority", ctx))).toEqual(["urgent", "low", "none"]);
  });

  it("orders by the DISPLAYED title, so a leading token can't decide it", () => {
    const todos = [
      todo("@urgent banana", { priority: "URGENT" }),
      todo("due @ 2026-09-20 apple", { due: "2026-09-20" }),
    ];
    expect(titles(sortTodos(todos, "title", ctx))[0]).toContain("apple");
  });

  it("ends every tie-break in file order, so a list never reshuffles itself", () => {
    const todos = [
      todo("second", { file: "B.md", line: 1 }),
      todo("third", { file: "B.md", line: 7 }),
      todo("first", { file: "A.md", line: 4 }),
    ];
    // Nothing separates these but the file and the line.
    for (const key of ["due", "priority", "title", "project"] as SortKey[]) {
      const once = sortTodos(todos, key, ctx);
      expect(titles(sortTodos(once, key, ctx)), key).toEqual(titles(once));
    }
    expect(titles(sortTodos(todos, "due", ctx))).toEqual(["first", "second", "third"]);
  });

  it("never mutates the array it was handed", () => {
    const todos = [todo("b", { due: "2026-09-20" }), todo("a", { due: "2026-09-10" })];
    sortTodos(todos, "due", ctx);
    expect(titles(todos)).toEqual(["b", "a"]);
  });
});
