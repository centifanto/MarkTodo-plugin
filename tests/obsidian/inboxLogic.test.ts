import { describe, it, expect } from "vitest";
import { buildInboxSections } from "../../src/obsidian/inboxLogic";
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
  rec({ id: "p1", project: "Personal", file: "Personal.md" }),
  rec({ id: "l1", file: "Daily/2026-09-13.md", line: 4 }),
  rec({ id: "l2", file: "Areas/Garden.md", line: 1 }),
  rec({ id: "l3", file: "Daily/2026-09-13.md", line: 2 }),
  rec({ id: "ldone", file: "Areas/Garden.md", glyph: "x" }),
  rec({ id: null, file: "Meetings/Standup.md", line: 7 }),
  rec({ id: null, file: "Meetings/Standup.md", line: 9, glyph: "x" }),
];

describe("buildInboxSections", () => {
  it("loose section: managed, non-project, not done — grouped by note, line order", () => {
    const s = buildInboxSections(TODOS, { showUnmanaged: true });
    expect(s.looseCount).toBe(3);
    expect(s.loose.map((g) => [g.file, g.todos.map((t) => t.id)])).toEqual([
      ["Areas/Garden.md", ["l2"]],
      ["Daily/2026-09-13.md", ["l3", "l1"]],
    ]);
  });

  it("unmanaged section: plain open checkboxes outside projects", () => {
    const s = buildInboxSections(TODOS, { showUnmanaged: true });
    expect(s.unmanagedCount).toBe(1);
    expect(s.unmanaged.map((g) => g.file)).toEqual(["Meetings/Standup.md"]);
  });

  it("the unmanaged section can be turned off", () => {
    const s = buildInboxSections(TODOS, { showUnmanaged: false });
    expect(s.unmanaged).toEqual([]);
    expect(s.unmanagedCount).toBe(0);
    expect(s.looseCount).toBe(3);
  });

  it("is empty when everything is in a project or done (Inbox zero)", () => {
    const s = buildInboxSections([TODOS[0], TODOS[4]], { showUnmanaged: true });
    expect(s.looseCount + s.unmanagedCount).toBe(0);
  });
});
