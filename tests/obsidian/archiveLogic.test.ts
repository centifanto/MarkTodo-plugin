import { describe, it, expect } from "vitest";
import { archiveTarget, parentOf } from "../../src/obsidian/archiveLogic";

const FOLDER = "MarkTodo/Archive";

describe("parentOf", () => {
  it("is the folder, or empty at the vault root", () => {
    expect(parentOf("a/b/c.md")).toBe("a/b");
    expect(parentOf("c.md")).toBe("");
  });
});

describe("archiveTarget", () => {
  it("does nothing at all when the setting is off — the flag alone archives", () => {
    expect(archiveTarget("Reno.md", true, FOLDER, false)).toBeNull();
    expect(archiveTarget("MarkTodo/Archive/Reno.md", false, FOLDER, false)).toBeNull();
  });

  it("moves an archived note into the archive folder", () => {
    expect(archiveTarget("Reno.md", true, FOLDER, true)).toBe("MarkTodo/Archive/Reno.md");
    expect(archiveTarget("Work/Reno.md", true, FOLDER, true)).toBe(
      "MarkTodo/Archive/Reno.md",
    );
  });

  it("leaves an archived note that is already there", () => {
    expect(archiveTarget("MarkTodo/Archive/Reno.md", true, FOLDER, true)).toBeNull();
  });

  it("moves an un-archived note back out, to the vault root", () => {
    // Where it came from is recorded nowhere, so a predictable destination beats
    // an invented one.
    expect(archiveTarget("MarkTodo/Archive/Reno.md", false, FOLDER, true)).toBe("Reno.md");
  });

  it("leaves a live note that was never in the archive folder", () => {
    expect(archiveTarget("Work/Reno.md", false, FOLDER, true)).toBeNull();
    expect(archiveTarget("Reno.md", false, FOLDER, true)).toBeNull();
  });

  it("is inert when the archive folder is blank — nothing to move into", () => {
    expect(archiveTarget("Reno.md", true, "", true)).toBeNull();
    expect(archiveTarget("Reno.md", true, "  /  ", true)).toBeNull();
  });

  it("only matches the folder exactly, never a lookalike sibling", () => {
    expect(archiveTarget("MarkTodo/Archived/Reno.md", true, FOLDER, true)).toBe(
      "MarkTodo/Archive/Reno.md",
    );
  });
});
