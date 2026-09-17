import { describe, it, expect } from "vitest";
import { serializeCapsule, serializeTodoLine } from "../../src/core/serialize";
import { type Todo } from "../../src/core/types";

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: null,
    glyph: " ",
    priority: "NONE",
    displayText: "Thing",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    ...overrides,
  };
}

describe("serializeCapsule", () => {
  it("is null for an unmanaged todo (no id)", () => {
    expect(serializeCapsule(todo())).toBeNull();
  });

  it("emits id only when priority is NONE", () => {
    expect(serializeCapsule(todo({ id: "a5" }))).toBe("<!-- mt id=a5 -->");
  });

  it("never writes priority into the capsule (it's an inline token)", () => {
    expect(serializeCapsule(todo({ id: "a2", priority: "HIGH" }))).toBe("<!-- mt id=a2 -->");
  });

  it("appends preserved unknown tokens after the id", () => {
    expect(
      serializeCapsule(todo({ id: "ee", priority: "URGENT", extraTokens: ["foo=bar"] })),
    ).toBe("<!-- mt id=ee foo=bar -->");
  });
});

describe("serializeTodoLine — inline priority", () => {
  it("writes the token from the priority field when the text has none", () => {
    expect(serializeTodoLine(todo({ id: "a2", priority: "HIGH", displayText: "Demo" }))).toBe(
      "- [ ] Demo @high <!-- mt id=a2 -->",
    );
  });

  it("inserts before a due token", () => {
    expect(
      serializeTodoLine(todo({ priority: "LOW", displayText: "Pay #bills due @ 2026-10-01" })),
    ).toBe("- [ ] Pay #bills @low due @ 2026-10-01");
  });

  it("expands aliases and lowercases, leaving the rest of the text alone", () => {
    expect(serializeTodoLine(todo({ priority: "URGENT", displayText: "Fix @PU leak [[Sink]]" }))).toBe(
      "- [ ] Fix @urgent leak [[Sink]]",
    );
  });

  it("an empty body with a priority is just the token", () => {
    expect(serializeTodoLine(todo({ id: "x1", priority: "HIGH", displayText: "" }))).toBe(
      "- [ ] @high <!-- mt id=x1 -->",
    );
  });
});

describe("serializeTodoLine", () => {
  it("serializes a plain unmanaged todo with no trailing space", () => {
    expect(serializeTodoLine(todo({ displayText: "Buy milk" }))).toBe("- [ ] Buy milk");
  });

  it("serializes an empty body without a dangling space", () => {
    expect(serializeTodoLine(todo({ displayText: "" }))).toBe("- [ ]");
    expect(serializeTodoLine(todo({ id: "x1", displayText: "" }))).toBe(
      "- [ ] <!-- mt id=x1 -->",
    );
  });

  it("preserves indent, bullet, and glyph", () => {
    expect(
      serializeTodoLine(todo({ indent: "  ", bullet: "*", glyph: "/", displayText: "Go" })),
    ).toBe("  * [/] Go");
  });
});

describe("serializeTodoLine — typed dates", () => {
  it("writes typed dates back padded", () => {
    expect(
      serializeTodoLine(todo({ id: "x1", displayText: "Call Bob due @ 2026-9-14 notify @ 2026-9-13 8:30" })),
    ).toBe("- [ ] Call Bob due @ 2026-09-14 notify @ 2026-09-13 08:30 <!-- mt id=x1 -->");
  });
});
