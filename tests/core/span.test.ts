import { describe, it, expect } from "vitest";
import { itemEndOf, noteLinesOf, noteOf } from "../../src/core/span";

const L = (s: string) => s.split("\n");

describe("itemEndOf — what a todo owns", () => {
  it("is the next line when the todo has nothing under it", () => {
    const lines = L("- [ ] One <!-- mt id=a1 -->\n- [ ] Two <!-- mt id=a2 -->");
    expect(itemEndOf(lines, 0)).toBe(1);
  });

  it("includes deeper-indented note lines", () => {
    const lines = L("- [ ] One <!-- mt id=a1 -->\n    note one\n    note two\n- [ ] Two");
    expect(itemEndOf(lines, 0)).toBe(3);
  });

  it("includes nested todo lines — a move carries sub-items too", () => {
    const lines = L("- [ ] Parent <!-- mt id=a1 -->\n    - [ ] Child <!-- mt id=a2 -->\n- [ ] Next");
    expect(itemEndOf(lines, 0)).toBe(2);
  });

  it("ends at a blank line", () => {
    const lines = L("- [ ] One\n    note\n\n    orphan");
    expect(itemEndOf(lines, 0)).toBe(2);
  });

  it("ends at a line indented the same or less", () => {
    const lines = L("  - [ ] One\n  still one?\n    deeper");
    expect(itemEndOf(lines, 0)).toBe(1);
  });

  it("is safe at the end of a file and out of range", () => {
    expect(itemEndOf(L("- [ ] One"), 0)).toBe(1);
    expect(itemEndOf(L("- [ ] One"), 5)).toBe(5);
    expect(itemEndOf([], -1)).toBe(0);
  });
});

describe("noteLinesOf / noteOf — the note block", () => {
  it("reads the indented lines under a todo", () => {
    const lines = L("- [ ] Demo floor <!-- mt id=a1 -->\n    Dumpster booked.\n    Call the tile guy.");
    expect(noteLinesOf(lines, 0)).toEqual(["    Dumpster booked.", "    Call the tile guy."]);
    expect(noteOf(lines, 0)).toBe("Dumpster booked.\nCall the tile guy.");
  });

  it("is empty when the todo has no note", () => {
    expect(noteOf(L("- [ ] One\n- [ ] Two"), 0)).toBe("");
    expect(noteLinesOf(L("- [ ] One"), 0)).toEqual([]);
  });

  it("stops at a nested todo — a sub-todo is not the note", () => {
    const lines = L("- [ ] Parent\n    the note\n    - [ ] Child\n    after the child");
    expect(noteOf(lines, 0)).toBe("the note");
  });

  it("dedents by the first note line's indent, keeping relative shape", () => {
    const lines = L("- [ ] One\n    top\n        indented under it\n    back");
    expect(noteOf(lines, 0)).toBe("top\n    indented under it\nback");
  });

  it("does not over-trim a ragged block", () => {
    const lines = L("- [ ] One\n        deep first\n    shallower");
    expect(noteOf(lines, 0)).toBe("deep first\nshallower");
  });

  it("reads a note on a nested todo by that todo's own indent", () => {
    const lines = L("- [ ] Parent\n    - [ ] Child <!-- mt id=a2 -->\n        child note");
    expect(noteOf(lines, 1)).toBe("child note");
  });

  it("ignores a blank line and anything after it", () => {
    const lines = L("- [ ] One\n    kept\n\n    dropped");
    expect(noteOf(lines, 0)).toBe("kept");
  });
});
