import { describe, it, expect } from "vitest";
import { noteOf, setNoteBlock } from "../../src/core/span";

const L = (s: string) => s.split("\n");

describe("setNoteBlock", () => {
  it("adds a note under a todo that had none", () => {
    const lines = L("## Backlog\n- [ ] Demo floor <!-- mt id=a1 -->\n## Done");
    const out = setNoteBlock(lines, 1, "Dumpster booked.")!;
    expect(out).toEqual([
      "## Backlog",
      "- [ ] Demo floor <!-- mt id=a1 -->",
      "    Dumpster booked.",
      "## Done",
    ]);
  });

  it("round-trips through noteOf", () => {
    const lines = L("- [ ] A <!-- mt id=a -->");
    const out = setNoteBlock(lines, 0, "one\ntwo")!;
    expect(noteOf(out, 0)).toBe("one\ntwo");
  });

  it("replaces an existing note, keeping its indent", () => {
    const lines = L("- [ ] A <!-- mt id=a -->\n\t old one\n\t still old\n- [ ] B");
    const out = setNoteBlock(lines, 0, "new")!;
    expect(out).toEqual(["- [ ] A <!-- mt id=a -->", "\t new", "- [ ] B"]);
  });

  it("clears the note when given an empty string", () => {
    const lines = L("- [ ] A <!-- mt id=a -->\n    gone\n    also gone\n- [ ] B");
    expect(setNoteBlock(lines, 0, "")).toEqual(["- [ ] A <!-- mt id=a -->", "- [ ] B"]);
    expect(setNoteBlock(lines, 0, "   \n  ")).toEqual([
      "- [ ] A <!-- mt id=a -->",
      "- [ ] B",
    ]);
  });

  it("indents relative to a nested todo's own indent", () => {
    const lines = L("- [ ] Parent\n    - [ ] Child <!-- mt id=c -->");
    const out = setNoteBlock(lines, 1, "child note")!;
    expect(out[2]).toBe("        child note");
  });

  it("leaves everything after the block untouched", () => {
    const lines = L("- [ ] A <!-- mt id=a -->\n    old\n- [ ] B <!-- mt id=b -->\n    b note");
    const out = setNoteBlock(lines, 0, "one\ntwo\nthree")!;
    expect(out.slice(4)).toEqual(["- [ ] B <!-- mt id=b -->", "    b note"]);
  });

  it("drops blank lines — a blank would end the block and orphan what follows", () => {
    const lines = L("- [ ] A <!-- mt id=a -->");
    const out = setNoteBlock(lines, 0, "first\n\n\nsecond")!;
    expect(out).toEqual(["- [ ] A <!-- mt id=a -->", "    first", "    second"]);
    expect(noteOf(out, 0)).toBe("first\nsecond");
  });

  it("refuses a line that would become a sub-todo", () => {
    const lines = L("- [ ] A <!-- mt id=a -->");
    expect(setNoteBlock(lines, 0, "- [ ] sneaky sub-todo")).toBeNull();
    expect(setNoteBlock(lines, 0, "fine\n- [x] not fine")).toBeNull();
  });

  it("refuses a line that could forge a capsule", () => {
    const lines = L("- [ ] A <!-- mt id=a -->");
    expect(setNoteBlock(lines, 0, "<!-- mt id=fake -->")).toBeNull();
  });

  it("returns null when nothing would change", () => {
    const lines = L("- [ ] A <!-- mt id=a -->\n    same");
    expect(setNoteBlock(lines, 0, "same")).toBeNull();
    expect(setNoteBlock(L("- [ ] A"), 0, "")).toBeNull();
  });

  it("is safe on an out-of-range index", () => {
    expect(setNoteBlock(L("- [ ] A"), 9, "x")).toBeNull();
    expect(setNoteBlock(L("- [ ] A"), -1, "x")).toBeNull();
  });

  it("never disturbs a following sub-item that is not part of the note", () => {
    const lines = L("- [ ] Parent <!-- mt id=p -->\n    note\n    - [ ] Child <!-- mt id=c -->");
    const out = setNoteBlock(lines, 0, "new note")!;
    expect(out).toEqual([
      "- [ ] Parent <!-- mt id=p -->",
      "    new note",
      "    - [ ] Child <!-- mt id=c -->",
    ]);
  });
});
