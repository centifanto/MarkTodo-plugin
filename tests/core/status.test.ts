import { describe, it, expect } from "vitest";
import {
  setStatus,
  checkTodo,
  uncheckTodo,
  toggleCheckbox,
  setPriority,
} from "../../src/core/status";
import {
  type Todo,
  STATUS_GLYPH,
  STATUS_ORDER,
  PRIORITY_ORDER,
  statusOf,
} from "../../src/core/types";

/** Build a fresh baseline Todo with every field populated. */
function makeTodo(): Todo {
  return {
    id: "abc123de",
    glyph: " ",
    priority: "NONE",
    displayText: "Buy milk",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
  };
}

describe("setStatus", () => {
  for (const status of STATUS_ORDER) {
    it(`sets the glyph for ${status}`, () => {
      const todo = makeTodo();
      const next = setStatus(todo, status);
      expect(next.glyph).toBe(STATUS_GLYPH[status]);
      expect(statusOf(next)).toBe(status);
    });
  }

  it("returns a new object and does not mutate the input", () => {
    const todo = makeTodo();
    const next = setStatus(todo, "PROGRESS");
    expect(next).not.toBe(todo);
    expect(todo.glyph).toBe(" ");
    expect(statusOf(todo)).toBe("BACKLOG");
  });

  it("preserves all other fields", () => {
    const todo = makeTodo();
    const next = setStatus(todo, "BLOCKED");
    expect(next).toEqual({ ...makeTodo(), glyph: STATUS_GLYPH.BLOCKED });
  });
});

describe("checkTodo", () => {
  it("sets glyph 'x' / status DONE", () => {
    const todo = makeTodo();
    const next = checkTodo(todo);
    expect(next.glyph).toBe("x");
    expect(next.glyph).toBe(STATUS_GLYPH.DONE);
    expect(statusOf(next)).toBe("DONE");
  });

  it("does not mutate the input", () => {
    const todo = makeTodo();
    const next = checkTodo(todo);
    expect(next).not.toBe(todo);
    expect(todo.glyph).toBe(" ");
  });
});

describe("uncheckTodo", () => {
  it("maps to BACKLOG (glyph ' '), not PAUSED", () => {
    const todo = { ...makeTodo(), glyph: "x" };
    const next = uncheckTodo(todo);
    expect(next.glyph).toBe(" ");
    expect(next.glyph).toBe(STATUS_GLYPH.BACKLOG);
    expect(statusOf(next)).toBe("BACKLOG");
  });

  it("does not mutate the input", () => {
    const todo = { ...makeTodo(), glyph: "x" };
    const next = uncheckTodo(todo);
    expect(next).not.toBe(todo);
    expect(todo.glyph).toBe("x");
  });
});

describe("toggleCheckbox", () => {
  it("unchecks a DONE todo to BACKLOG", () => {
    const todo = { ...makeTodo(), glyph: "x" };
    const next = toggleCheckbox(todo);
    expect(statusOf(next)).toBe("BACKLOG");
    expect(next.glyph).toBe(" ");
    expect(todo.glyph).toBe("x");
  });

  for (const status of STATUS_ORDER.filter((s) => s !== "DONE")) {
    it(`checks a ${status} todo to DONE`, () => {
      const todo = { ...makeTodo(), glyph: STATUS_GLYPH[status] };
      const next = toggleCheckbox(todo);
      expect(statusOf(next)).toBe("DONE");
      expect(next.glyph).toBe("x");
    });
  }

  it("does not mutate the input", () => {
    const todo = makeTodo();
    const next = toggleCheckbox(todo);
    expect(next).not.toBe(todo);
    expect(todo.glyph).toBe(" ");
  });
});

describe("setPriority", () => {
  for (const priority of PRIORITY_ORDER) {
    it(`sets priority ${priority}`, () => {
      const todo = makeTodo();
      const next = setPriority(todo, priority);
      expect(next.priority).toBe(priority);
    });
  }

  it("returns a new object and does not mutate the input", () => {
    const todo = makeTodo();
    const next = setPriority(todo, "URGENT");
    expect(next).not.toBe(todo);
    expect(todo.priority).toBe("NONE");
  });

  it("preserves the glyph and other fields, writing the inline token", () => {
    const todo = makeTodo();
    const next = setPriority(todo, "HIGH");
    expect(next).toEqual({ ...makeTodo(), priority: "HIGH", displayText: "Buy milk @high" });
  });

  it("replaces an existing token in place and NONE removes it", () => {
    const todo = { ...makeTodo(), displayText: "Buy @ph milk due @ 2026-09-20", priority: "HIGH" as const };
    expect(setPriority(todo, "LOW").displayText).toBe("Buy @low milk due @ 2026-09-20");
    expect(setPriority(todo, "NONE").displayText).toBe("Buy milk due @ 2026-09-20");
  });
});
