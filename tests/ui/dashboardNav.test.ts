import { describe, it, expect } from "vitest";
import {
  DEFAULT_SELECTION,
  LIST_COLUMN_MIN,
  MIN_DUAL_WIDTH,
  NAV_COLUMN_MIN,
  clampNavWidth,
  effectivePaneMode,
  followRename,
  parseSelection,
  sameSelection,
  selectionToken,
  searchTodos,
  todoMatchesQuery,
} from "../../src/ui/dashboardNav";
import { type TodoRecord } from "../../src/core/types";

function todo(displayText: string, over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "a",
    glyph: " ",
    priority: "NONE",
    displayText,
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    file: "P.md",
    line: 0,
    project: "Garden",
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
    ...over,
  };
}

describe("pane mode", () => {
  it("is what the setting says on a wide desktop dashboard", () => {
    expect(effectivePaneMode("dual", { phone: false, width: 800 })).toBe("dual");
    expect(effectivePaneMode("single", { phone: false, width: 800 })).toBe("single");
  });

  it("is always one column on a phone, or when squeezed too narrow", () => {
    expect(effectivePaneMode("dual", { phone: true, width: 800 })).toBe("single");
    expect(effectivePaneMode("dual", { phone: false, width: MIN_DUAL_WIDTH - 1 })).toBe("single");
  });

  it("trusts the setting before the pane has been measured", () => {
    expect(effectivePaneMode("dual", { phone: false, width: 0 })).toBe("dual");
  });

  it("clamps the divider so both columns stay usable", () => {
    expect(clampNavWidth(50, 700)).toBe(NAV_COLUMN_MIN);
    expect(clampNavWidth(650, 700)).toBe(700 - LIST_COLUMN_MIN);
    expect(clampNavWidth(300.4, 700)).toBe(300);
  });
});

describe("selection", () => {
  it("compares, tokens and parses", () => {
    expect(sameSelection({ kind: "project", path: "A.md" }, { kind: "project", path: "A.md" })).toBe(true);
    expect(sameSelection({ kind: "project", path: "A.md" }, { kind: "project", path: "B.md" })).toBe(false);
    expect(selectionToken({ kind: "inbox" })).toBe("view:inbox");
    expect(selectionToken({ kind: "project", path: "A.md" })).toBe("file:A.md");
    expect(parseSelection({ kind: "todos" })).toEqual({ kind: "todos" });
    expect(parseSelection({ kind: "project", path: "A.md" })).toEqual({ kind: "project", path: "A.md" });
    expect(parseSelection({ kind: "project" })).toEqual(DEFAULT_SELECTION);
    expect(parseSelection(undefined)).toEqual(DEFAULT_SELECTION);
  });

  it("follows a renamed project and lets go of a deleted one", () => {
    const sel = { kind: "project", path: "A.md" } as const;
    expect(followRename(sel, "A.md", "Work/A.md")).toEqual({ kind: "project", path: "Work/A.md" });
    expect(followRename(sel, "A.md", null)).toEqual(DEFAULT_SELECTION);
    expect(followRename({ kind: "inbox" }, "A.md", null)).toEqual({ kind: "inbox" });
  });
});

describe("todoMatchesQuery", () => {
  it("matches every word, anywhere in title, note, project or tags, ignoring case", () => {
    const t = todo("Buy [[Seeds]] @high due @ 2026-09-20", { note: "heirloom tomatoes", tags: ["#spring"] });
    expect(todoMatchesQuery(t, "")).toBe(true);
    expect(todoMatchesQuery(t, "seeds")).toBe(true);
    expect(todoMatchesQuery(t, "TOMATOES garden")).toBe(true);
    expect(todoMatchesQuery(t, "#spring")).toBe(true);
    expect(todoMatchesQuery(t, "seeds carrots")).toBe(false);
  });

  it("does not match the hidden tokens a row never shows", () => {
    expect(todoMatchesQuery(todo("Water @high due @ 2026-09-20"), "2026")).toBe(false);
    expect(todoMatchesQuery(todo("Water @high"), "high")).toBe(false);
  });
});

describe("searchTodos", () => {
  it("finds matches across the vault in note order, done ones included, archived ones not", () => {
    const todos = [
      todo("Water seeds", { file: "B.md", line: 3 }),
      todo("Buy seeds", { file: "A.md", line: 9, glyph: "x" }),
      todo("Plant seeds", { file: "A.md", line: 2 }),
      todo("Old seeds", { file: "C.md", archived: true }),
      todo("Mow", { file: "A.md", line: 1 }),
    ];
    expect(searchTodos(todos, "seeds").map((t) => t.displayText)).toEqual(["Plant seeds", "Buy seeds", "Water seeds"]);
  });

  it("has no results for an empty query", () => {
    expect(searchTodos([todo("Anything")], "  ")).toEqual([]);
  });
});
