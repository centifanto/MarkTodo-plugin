import { describe, it, expect } from "vitest";
import { parseTodoLine, extractCapsule } from "../../src/core/parse";
import { statusOf, isManaged } from "../../src/core/types";

describe("parseTodoLine", () => {
  it("parses a plain unmanaged backlog todo", () => {
    const t = parseTodoLine("- [ ] Buy milk");
    expect(t).not.toBeNull();
    expect(t).toMatchObject({
      id: null,
      glyph: " ",
      priority: "NONE",
      displayText: "Buy milk",
      indent: "",
      bullet: "-",
      due: null,
      tags: [],
      links: [],
      extraTokens: [],
    });
    expect(statusOf(t!)).toBe("BACKLOG");
    expect(isManaged(t!)).toBe(false);
  });

  it("parses a managed todo with status glyph and priority", () => {
    const t = parseTodoLine("- [/] Demo old floor <!-- mt id=a2 p=high -->")!;
    expect(t.id).toBe("a2");
    expect(t.glyph).toBe("/");
    expect(t.priority).toBe("HIGH");
    expect(t.displayText).toBe("Demo old floor");
    expect(statusOf(t)).toBe("PROGRESS");
    expect(isManaged(t)).toBe(true);
  });

  it("keeps links, tags, and dates INLINE in displayText (in-place model)", () => {
    const t = parseTodoLine("- [ ] Call [[Bob]] about #reno due @ 2026-07-01")!;
    // recognized for indexing...
    expect(t.links).toEqual(["Bob"]);
    expect(t.tags).toEqual(["reno"]);
    expect(t.due).toBe("2026-07-01");
    // ...but NOT removed from the text
    expect(t.displayText).toBe("Call [[Bob]] about #reno due @ 2026-07-01");
  });

  it("preserves indentation and bullet character", () => {
    expect(parseTodoLine("  - [x] Indented")!.indent).toBe("  ");
    expect(parseTodoLine("\t- [x] Tabbed")!.indent).toBe("\t");
    expect(parseTodoLine("* [ ] Star")!.bullet).toBe("*");
    expect(parseTodoLine("+ [ ] Plus")!.bullet).toBe("+");
  });

  it("preserves an unknown glyph verbatim and classifies it as BACKLOG", () => {
    const t = parseTodoLine("- [?] Weird <!-- mt id=zz -->")!;
    expect(t.glyph).toBe("?");
    expect(statusOf(t)).toBe("BACKLOG");
  });

  it("handles an empty todo body", () => {
    const t = parseTodoLine("- [ ]")!;
    expect(t).not.toBeNull();
    expect(t.displayText).toBe("");
  });

  it("returns null for non-todo lines", () => {
    expect(parseTodoLine("## Heading")).toBeNull();
    expect(parseTodoLine("Just a paragraph")).toBeNull();
    expect(parseTodoLine("- a plain bullet")).toBeNull();
    expect(parseTodoLine("")).toBeNull();
  });

  it("collects multiple tags and links", () => {
    const t = parseTodoLine("- [ ] [[A]] [[B]] #x #y/z")!;
    expect(t.links).toEqual(["A", "B"]);
    expect(t.tags).toEqual(["x", "y/z"]);
  });
});

describe("extractCapsule", () => {
  it("returns no capsule when absent", () => {
    const { capsule, rest } = extractCapsule("just text");
    expect(capsule).toBeNull();
    expect(rest).toBe("just text");
  });

  it("lifts id and priority, preserving unknown keys verbatim", () => {
    const { capsule, rest } = extractCapsule(
      "Body <!-- mt id=abc p=urgent foo=bar baz -->",
    );
    expect(rest).toBe("Body");
    expect(capsule).toEqual({
      id: "abc",
      priority: "URGENT",
      extraTokens: ["foo=bar", "baz"],
    });
  });

  it("preserves an unknown priority value as an extra token (never dropped)", () => {
    const { capsule } = extractCapsule("x <!-- mt id=q1 p=critical -->");
    expect(capsule!.priority).toBe("NONE");
    expect(capsule!.extraTokens).toContain("p=critical");
  });

  it("only extracts a TRAILING capsule (a mid-line comment stays in the text)", () => {
    const { capsule, rest } = extractCapsule("middle <!-- mt id=abc --> trailing");
    expect(capsule).toBeNull();
    expect(rest).toBe("middle <!-- mt id=abc --> trailing");
  });

  it("treats an empty id value as unmanaged", () => {
    const { capsule } = extractCapsule("x <!-- mt id= -->");
    expect(capsule!.id).toBeNull();
  });
});

describe("parseTodoLine — review hardening", () => {
  it("tolerates a trailing CR (CRLF files)", () => {
    const t = parseTodoLine("- [ ] Buy milk\r");
    expect(t).not.toBeNull();
    expect(t!.displayText).toBe("Buy milk");
  });

  it("does not extract a mid-line capsule (id stays null, text verbatim)", () => {
    const t = parseTodoLine("- [ ] middle <!-- mt id=abc12345 --> trailing")!;
    expect(t.id).toBeNull();
    expect(t.displayText).toBe("middle <!-- mt id=abc12345 --> trailing");
  });
});

describe("parseTodoLine — typed dates", () => {
  it("reads an unpadded due date as canonical, keeping the text as typed", () => {
    const t = parseTodoLine("- [ ] Call Bob due @ 2026-9-14")!;
    expect(t.due).toBe("2026-09-14");
    expect(t.displayText).toBe("Call Bob due @ 2026-9-14");
  });

  it("accepts a one-digit day and no space after @", () => {
    expect(parseTodoLine("- [ ] x due @2026-10-4")!.due).toBe("2026-10-04");
  });

  it("does not read extra digits as a date", () => {
    expect(parseTodoLine("- [ ] x due @ 2026-09-145")!.due).toBeNull();
  });
});
