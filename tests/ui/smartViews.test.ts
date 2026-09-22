import { describe, it, expect } from "vitest";
import {
  OVERDUE_KEY,
  SMART_VIEWS,
  arrangeSmartTodos,
  smartDateOf,
  smartViewCounts,
  smartViewTodos,
  splitOverdue,
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

describe("smartViewTodos — Agenda", () => {
  it("takes everything due today or earlier that isn't done", () => {
    const todos = [
      todo("overdue", { due: "2026-09-01" }),
      todo("today", { due: TODAY }),
      todo("later", { due: "2026-09-20" }),
      todo("undated"),
      todo("done today", { due: TODAY, glyph: "x" }),
    ];
    expect(titles(smartViewTodos(todos, "agenda", TODAY))).toEqual(["overdue", "today"]);
  });

  it("includes loose todos — a todo in a daily note is still due today", () => {
    const todos = [todo("loose", { due: TODAY, project: null })];
    expect(smartViewTodos(todos, "agenda", TODAY)).toHaveLength(1);
  });

  it("excludes archived notes", () => {
    const todos = [todo("filed away", { due: TODAY, archived: true })];
    expect(smartViewTodos(todos, "agenda", TODAY)).toEqual([]);
  });
});

describe("smartViewTodos — Upcoming", () => {
  it("runs through a week out, with no lower bound — overdue is upcoming too", () => {
    const todos = [
      todo("long overdue", { due: "2026-08-01" }),
      todo("overdue", { due: "2026-09-14" }),
      todo("today", { due: TODAY }),
      todo("edge", { due: "2026-09-22" }),
      todo("past the edge", { due: "2026-09-23" }),
    ];
    expect(titles(smartViewTodos(todos, "upcoming", TODAY))).toEqual([
      "long overdue",
      "overdue",
      "today",
      "edge",
    ]);
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

describe("arrangeSmartTodos — sorting", () => {
  // Dates ahead of TODAY, so the overdue band doesn't claim them and this stays
  // a test of the ordering rather than of the split.
  it("sorts by date soonest first, undated last", () => {
    const todos = [
      todo("c"),
      todo("a", { due: "2026-09-16" }),
      todo("b", { due: "2026-09-18" }),
    ];
    const [section] = arrangeSmartTodos(todos, "upcoming", { sort: "date", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["a", "b", "c"]);
  });

  it("sorts by priority in URGENT → NONE order", () => {
    const todos = [todo("low", { priority: "LOW" }), todo("urgent", { priority: "URGENT" })];
    const [section] = arrangeSmartTodos(todos, "agenda", { sort: "priority", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["urgent", "low"]);
  });

  it("sorts by the DISPLAYED title, not the raw line", () => {
    const todos = [
      todo("due @ 2026-09-20 apple", { due: "2026-09-20" }),
      todo("@urgent banana", { priority: "URGENT" }),
    ];
    const [section] = arrangeSmartTodos(todos, "agenda", { sort: "title", group: "none" }, ctx);
    // Sorted on "apple"/"banana" — a leading token must not decide the order.
    expect(titles(section.todos)[0]).toContain("apple");
  });

  it("falls back to file order so the list never reshuffles between renders", () => {
    const todos = [todo("second", { line: 9 }), todo("first", { line: 2 })];
    const [section] = arrangeSmartTodos(todos, "agenda", { sort: "date", group: "none" }, ctx);
    expect(titles(section.todos)).toEqual(["first", "second"]);
  });

  it("returns no section at all when there is nothing to show", () => {
    expect(arrangeSmartTodos([], "agenda", { sort: "date", group: "none" }, ctx)).toEqual([]);
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
    const sections = arrangeSmartTodos(todos, "agenda", { sort: "date", group: "date" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Overdue", "Today", "Tomorrow", "No date"]);
  });

  it("groups by project with loose todos last", () => {
    const todos = [
      todo("loose", { project: null }),
      todo("zed", { project: "Zed" }),
      todo("acme", { project: "Acme" }),
    ];
    const sections = arrangeSmartTodos(todos, "agenda", { sort: "date", group: "project" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Acme", "Zed", "No project"]);
  });

  it("groups by status in column order", () => {
    const todos = [todo("done", { glyph: "x" }), todo("backlog")];
    const sections = arrangeSmartTodos(todos, "agenda", { sort: "date", group: "status" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Backlog", "Done"]);
  });

  it("groups by priority in rank order", () => {
    const todos = [todo("none"), todo("urgent", { priority: "URGENT" })];
    const sections = arrangeSmartTodos(todos, "agenda", { sort: "date", group: "priority" }, ctx);
    expect(sections.map((s) => s.title)).toEqual(["Urgent", "None"]);
  });
});

describe("splitOverdue", () => {
  it("splits on a strict due < today, keeping each side in order", () => {
    const todos = [
      todo("late", { due: "2026-09-01" }),
      todo("due today", { due: TODAY }),
      todo("yesterday", { due: "2026-09-14" }),
      todo("undated"),
    ];
    const { overdue, rest } = splitOverdue(todos, TODAY);
    expect(titles(overdue)).toEqual(["late", "yesterday"]);
    expect(titles(rest)).toEqual(["due today", "undated"]);
  });
});

describe("arrangeSmartTodos — the overdue band", () => {
  const late = todo("late", { due: "2026-09-01" });
  const now = todo("due today", { due: TODAY });

  // The band is the point of the screen, so it cannot depend on the user
  // happening to have picked one sort or one grouping.
  it("leads Agenda and Upcoming whatever the sort or group", () => {
    for (const view of ["agenda", "upcoming"] as const) {
      for (const sort of ["date", "priority", "title"] as const) {
        for (const group of ["none", "date", "project", "priority", "status"] as const) {
          const sections = arrangeSmartTodos([now, late], view, { sort, group }, ctx);
          expect(sections[0].key, `${view}/${sort}/${group}`).toBe(OVERDUE_KEY);
          expect(titles(sections[0].todos)).toEqual(["late"]);
        }
      }
    }
  });

  it("is left out entirely when nothing is late", () => {
    const sections = arrangeSmartTodos([now], "agenda", { sort: "date", group: "none" }, ctx);
    expect(sections.map((s) => s.key)).toEqual(["all"]);
  });

  it("is the only section when everything is late", () => {
    const sections = arrangeSmartTodos([late], "agenda", { sort: "date", group: "none" }, ctx);
    expect(sections.map((s) => s.key)).toEqual([OVERDUE_KEY]);
  });

  it("never bands Reminders — a passed reminder is still just a reminder", () => {
    const stale = todo("missed notify @ 2026-09-01 09:00");
    expect(arrangeSmartTodos([stale], "reminders", { sort: "date", group: "none" }, ctx)[0].key).toBe(
      "all",
    );
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
    expect(smartViewCounts([], TODAY)).toEqual({ agenda: 0, upcoming: 0, reminders: 0 });
  });
});
