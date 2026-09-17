import { describe, it, expect } from "vitest";
import { groupsSignature, todosSignature } from "../../src/ui/viewSignature";
import { type TodoRecord } from "../../src/core/types";

function todo(over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: "abcd1234", glyph: " ", priority: "NONE", displayText: "todo", indent: "", bullet: "-",
    due: null, tags: [], links: [], extraTokens: [], file: "F.md", line: 0, project: "P",
    subproject: null, section: null, note: "", projectGroup: null, archived: false, ...over,
  };
}

describe("todosSignature", () => {
  it("is stable for the same content", () => {
    expect(todosSignature([todo()])).toBe(todosSignature([todo()]));
  });

  it.each([
    ["status", { glyph: "x" }],
    ["title or its tokens", { displayText: "todo due @ 2026-09-15" }],
    ["adoption", { id: null }],
    ["position", { line: 4 }],
    ["file", { file: "G.md" }],
    ["note preview", { note: "a note" }],
  ])("changes when the %s changes", (_what, patch) => {
    expect(todosSignature([todo(patch)])).not.toBe(todosSignature([todo()]));
  });

  it("ignores what a row does not draw", () => {
    expect(todosSignature([todo({ subproject: "Kitchen", section: "DONE" })])).toBe(
      todosSignature([todo()]),
    );
  });

  it("distinguishes order, count, and a separator lookalike in the text", () => {
    expect(todosSignature([todo({ line: 1 }), todo({ line: 2 })])).not.toBe(
      todosSignature([todo({ line: 2 }), todo({ line: 1 })]),
    );
    expect(todosSignature([todo(), todo()])).not.toBe(todosSignature([todo()]));
    // A joined-string signature would collide here; JSON does not.
    expect(todosSignature([todo({ displayText: 'a","b' })])).not.toBe(
      todosSignature([todo({ displayText: 'a", "b' })]),
    );
  });
});

describe("groupsSignature", () => {
  it("changes when a group is renamed, even with identical todos", () => {
    const todos = [todo()];
    expect(groupsSignature([{ label: "Doing", todos }])).not.toBe(
      groupsSignature([{ label: "Backlog", todos }]),
    );
  });

  it("changes when a todo moves between groups", () => {
    expect(
      groupsSignature([{ label: "A", todos: [todo()] }, { label: "B", todos: [] }]),
    ).not.toBe(groupsSignature([{ label: "A", todos: [] }, { label: "B", todos: [todo()] }]));
  });

  it("matches for an unchanged render", () => {
    const build = () => [{ label: "Doing", todos: [todo(), todo({ line: 3 })] }];
    expect(groupsSignature(build())).toBe(groupsSignature(build()));
  });
});
