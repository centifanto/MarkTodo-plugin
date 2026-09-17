import { describe, it, expect } from "vitest";
import {
  SMART_VIEWS,
  arrangeSmartTodos,
  smartDateOf,
  smartViewCounts,
  smartViewTodos,
  type ArrangeContext,
} from "../../src/ui/smartViews";
import { type TodoRecord } from "../../src/core/types";
import { PRIORITY_LABEL } from "../../src/ui/iconMaps";

const TODAY = "2026-09-15";

const ctx: ArrangeContext = {
  today: TODAY,
  priorityLabels: PRIORITY_LABEL,
};

function todo(text: string, over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "abcd1234",
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

const titles = (todos: readonly TodoRecord[]) => todos.map((t) => t.displayText);

describe("smartViewTodos — Today", () => {
  it("takes everything due today or earlier that isn't done", () => {
    const todos = [
      todo("overdue", { due: "2026-09-01" }),
      todo("today", { due: TODAY }),
      todo("later", { due: "2026-09-20" }),
      todo("undated"),
      todo("done today", { due: TODAY, glyph: "x" }),
    ];
    expect(titles(smartViewTodos(todos, "today", TODAY))).toEqual(["overdue", "today"]);
  });

  it("includes loose todos — a todo in a daily note is still due today", () => {
    const todos = [todo("loose", { due: TODAY, project: null })];
    expect(smartViewTodos(todos, "today", TODAY)).toHaveLength(1);
  });

  it("excludes archived notes", () => {
    const todos = [todo("filed away", { due: TODAY, archived: true })];
    expect(smartViewTodos(todos, "today", TODAY)).toEqual([]);
  });
});

describe("smartViewTodos — Upcoming", () => {
  it("runs from today through a week out, and does not reach back", () => {
    const todos = [
      todo("overdue", { due: "2026-09-14" }),
      todo("today", { due: TODAY }),
      todo("edge", { due: "2026-09-22" }),
      todo("past the edge", { due: "2026-09-23" }),
    ];
    expect(titles(smartViewTodos(todos, "upcoming", TODAY))).toEqual(["today", "edge"]);
  });
});

describe("smartViewTodos — Reminders", () => {
  it("takes open todos carrying a notify token", () => {
    const todos = [
      todo("nagged notify @ 2026-09-20 09:00"),
      todo("no reminder"),
      todo("done notify @ 2026-09-20 09:00", { glyph: "x" }),
    ];
    expect(titles(smartViewTodos(todos, "reminders", TODAY))).toEqual([
      "nagged notify @ 2026-09-20 09:00",
    ]);
  });

  it("reads a hand-typed reminder, unpadded", () => {
    const t = todo("x notify @ 2026-9-5 9:30");
    expect(smartDateOf(t, "reminders")).toBe("2026-09-05 09:30");
  });
});

describe("smartViewTodos — Recent", () => {
  it("takes todos completed within the last week", () => {
    const todos = [
      todo("just done done @ 2026-09-14", { glyph: "x" }),
      todo("edge done @ 2026-09-08", { glyph: "x" }),
      todo("too old done @ 2026-09-07", { glyph: "x" }),
      todo("done but undated", { glyph: "x" }),
      todo("open done @ 2026-09-14"),
    ];
    expect(titles(smartViewTodos(todos, "recent", TODAY))).toEqual([
      "just done done @ 2026-09-14",
      "edge done @ 2026-09-08",
    ]);
  });
});

describe("arrangeSmartTodos — sorting", () => {
  it("sorts by date soonest first, undated last", () => {
    const todos = [
      todo("c"),
      todo("a", { due: "2026-09-10" }),
      todo("b", { due: "2026-09-12" }),
    ];
    const [section] = arrangeSmartTodos(todos, "today", { sort: "date", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["a", "b", "c"]);
  });

  it("sorts Recent newest first — the one segment that reads backwards", () => {
    const todos = [
      todo("older done @ 2026-09-10", { glyph: "x" }),
      todo("newer done @ 2026-09-14", { glyph: "x" }),
    ];
    const [section] = arrangeSmartTodos(todos, "recent", { sort: "date", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["newer done @ 2026-09-14", "older done @ 2026-09-10"]);
  });

  it("sorts by priority in URGENT → NONE order", () => {
    const todos = [todo("low", { priority: "LOW" }), todo("urgent", { priority: "URGENT" })];
    const [section] = arrangeSmartTodos(todos, "today", { sort: "priority", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["urgent", "low"]);
  });

  it("sorts by the DISPLAYED title, not the raw line", () => {
    const todos = [
      todo("due @ 2026-09-20 apple", { due: "2026-09-20" }),
      todo("@urgent banana", { priority: "URGENT" }),
    ];
    const [section] = arrangeSmartTodos(todos, "today", { sort: "title", group: "none" }, ctx);
    // Sorted on "apple"/"banana" — a leading token must not decide the order.
    expect(titles(section.todos)[0]).toContain("apple");
  });

  it("falls back to file order so the list never reshuffles between renders", () => {
    const todos = [todo("second", { line: 9 }), todo("first", { line: 2 })];
    const [section] = arrangeSmartTodos(todos, "today", { sort: "date", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["first", "second"]);
  });

  it("returns no section at all when there is nothing to show", () => {
    expect(arrangeSmartTodos([], "today", { sort: "date", group: "none" }, ctx)).toEqual([]);
  });
});

describe("arrangeSmartTodos — grouping", () => {
  it("puts Overdue first, then dates ascending, then No date", () => {
    const todos = [
      todo("none"),
      todo("tomorrow", { due: "2026-09-16" }),
      todo("late", { due: "2026-09-01" }),
      todo("today", { due: TODAY }),
    ];
    const sections = arrangeSmartTodos(todos, "today", { sort: "date", group: "date" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Overdue", "Today", "Tomorrow", "No date"]);
  });

  it("never calls a Recent date overdue — completion is in the past by definition", () => {
    const todos = [todo("done last week done @ 2026-09-10", { glyph: "x" })];
    const sections = arrangeSmartTodos(todos, "recent", { sort: "date", group: "date" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Thu, Sep 10"]);
  });

  it("orders Recent's date sections newest first", () => {
    const todos = [
      todo("a done @ 2026-09-10", { glyph: "x" }),
      todo("b done @ 2026-09-14", { glyph: "x" }),
    ];
    const sections = arrangeSmartTodos(todos, "recent", { sort: "date", group: "date" }, ctx);
    expect(sections.map((s) => s.key)).toEqual(["2026-09-14", "2026-09-10"]);
  });

  it("groups by project with loose todos last", () => {
    const todos = [
      todo("loose", { project: null }),
      todo("zed", { project: "Zed" }),
      todo("acme", { project: "Acme" }),
    ];
    const sections = arrangeSmartTodos(todos, "today", { sort: "date", group: "project" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Acme", "Zed", "No project"]);
  });

  it("groups by status in column order", () => {
    const todos = [todo("done", { glyph: "x" }), todo("backlog")];
    const sections = arrangeSmartTodos(todos, "today", { sort: "date", group: "status" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Backlog", "Done"]);
  });

  it("groups by priority in rank order", () => {
    const todos = [todo("none"), todo("urgent", { priority: "URGENT" })];
    const sections = arrangeSmartTodos(todos, "today", { sort: "date", group: "priority" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Urgent", "None"]);
  });
});

describe("smartViewCounts", () => {
  // The counts are a separate one-pass implementation (the tabs and the
  // navigator row ask for all four at once). This is the test that stops the
  // two from drifting apart.
  const todos = [
    todo("overdue", { due: "2026-09-01" }),
    todo("due today", { due: TODAY }),
    todo("this week", { due: "2026-09-18" }),
    todo("next month", { due: "2026-10-18" }),
    todo("undated"),
    todo("reminder notify @ 2026-09-20 09:00"),
    todo("both due @ 2026-09-16 notify @ 2026-09-16 08:00", { due: "2026-09-16" }),
    todo("finished done @ 2026-09-13", { glyph: "x" }),
    todo("finished long ago done @ 2026-01-01", { glyph: "x" }),
    todo("done, no stamp", { glyph: "x" }),
    todo("archived today", { due: TODAY, archived: true }),
    todo("loose today", { due: TODAY, project: null }),
  ];

  it("agrees with smartViewTodos for every segment", () => {
    const counts = smartViewCounts(todos, TODAY);
    for (const { key } of SMART_VIEWS) {
      expect(counts[key], key).toBe(smartViewTodos(todos, key, TODAY).length);
    }
  });

  it("agrees on an empty vault too", () => {
    expect(smartViewCounts([], TODAY)).toEqual({ today: 0, upcoming: 0, reminders: 0, recent: 0 });
  });
});
