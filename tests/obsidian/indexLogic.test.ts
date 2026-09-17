import { describe, it, expect } from "vitest";
import { INDEX_FORMAT_KEY, indexFileTodos, patchRecordsForRename } from "../../src/obsidian/indexLogic";
import { STATUS_LABELS, STATUS_ORDER, statusOf } from "../../src/core/types";

describe("indexFileTodos — project file with subprojects + status sections", () => {
  const text = [
    "## Kitchen",
    "### Progress",
    "- [/] Demo old floor <!-- mt id=a2 p=high -->",
    "### Done",
    "- [x] Order tile <!-- mt id=a5 -->",
    "",
    "## Bathroom",
    "### Backlog",
    "- [ ] Replace vanity <!-- mt id=a7 -->",
  ].join("\n");

  const recs = indexFileTodos("Reno.md", text, {
    projectName: "Reno",
  });

  it("finds all three todos with project name attached", () => {
    expect(recs).toHaveLength(3);
    expect(recs.every((r) => r.project === "Reno")).toBe(true);
    expect(recs.every((r) => r.file === "Reno.md")).toBe(true);
  });

  it("assigns the nearest non-status heading as subproject", () => {
    expect(recs.map((r) => [r.id, r.subproject, r.line])).toEqual([
      ["a2", "Kitchen", 2],
      ["a5", "Kitchen", 4],
      ["a7", "Bathroom", 8],
    ]);
  });

  it("derives status from the glyph", () => {
    expect(statusOf(recs[0])).toBe("PROGRESS");
    expect(statusOf(recs[1])).toBe("DONE");
    expect(statusOf(recs[2])).toBe("BACKLOG");
  });

  it("attaches the nearest status-section heading as `section`", () => {
    // section is the materialized-view side the heal rule diffs against.
    expect(recs.map((r) => r.section)).toEqual(["PROGRESS", "DONE", "BACKLOG"]);
  });
});

describe("indexFileTodos — flat project (status sections, no subprojects)", () => {
  const text = ["## Backlog", "- [ ] A <!-- mt id=b1 -->", "## Done", "- [x] B <!-- mt id=b2 -->"].join(
    "\n",
  );
  const recs = indexFileTodos("Flat.md", text, {
    projectName: "Flat",
  });

  it("leaves subproject null when only status headings are present", () => {
    expect(recs.map((r) => r.subproject)).toEqual([null, null]);
    expect(recs.map((r) => r.project)).toEqual(["Flat", "Flat"]);
  });

  it("still attaches section from the top-level status headings", () => {
    expect(recs.map((r) => r.section)).toEqual(["BACKLOG", "DONE"]);
  });
});

describe("indexFileTodos — ambient note (empty status set, headings group)", () => {
  const text = ["# Groceries", "- [ ] Milk", "## Errands", "- [ ] Bank"].join("\n");
  const recs = indexFileTodos("Notes.md", text, {
    projectName: null,
  });

  it("uses the nearest heading as subproject and leaves project null", () => {
    expect(recs.map((r) => [r.subproject, r.project])).toEqual([
      ["Groceries", null],
      ["Errands", null],
    ]);
  });

  it("leaves section null — ambient notes have no status sections", () => {
    expect(recs.map((r) => r.section)).toEqual([null, null]);
  });
});

describe("indexFileTodos — edge cases", () => {
  it("skips a leading YAML frontmatter block", () => {
    const text = ["---", "marktodo: true", "---", "- [ ] real <!-- mt id=c1 -->"].join("\n");
    const recs = indexFileTodos("P.md", text, {
      projectName: "P",
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].line).toBe(3);
    expect(recs[0].id).toBe("c1");
  });

  it("indexes indented todos with correct line numbers and indent", () => {
    const text = ["- [ ] Parent", "  - [/] Child <!-- mt id=d1 -->"].join("\n");
    const recs = indexFileTodos("N.md", text, {
      projectName: null,
    });
    expect(recs).toHaveLength(2);
    expect(recs[1].indent).toBe("  ");
    expect(recs[1].line).toBe(1);
  });

  it("returns nothing for a file with no todos", () => {
    const recs = indexFileTodos("Empty.md", "# Just a heading\n\nSome prose.", {
      projectName: null,
    });
    expect(recs).toEqual([]);
  });

  it("indexes todos in a CRLF file", () => {
    const text = ["## Backlog", "- [ ] A <!-- mt id=cr1 -->"].join("\r\n");
    const recs = indexFileTodos("C.md", text, {
      projectName: "C",
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("cr1");
    expect(recs[0].subproject).toBeNull();
  });
});

describe("patchRecordsForRename — renamed-project re-labelling", () => {
  it("re-labels a project file's records to the new path + basename", () => {
    const recs = indexFileTodos("Reno.md", "- [/] Demo <!-- mt id=r1 p=high -->", {
      projectName: "Reno",
    });
    const out = patchRecordsForRename(recs, "Projects/Home Reno.md", "Home Reno");
    expect(out[0].file).toBe("Projects/Home Reno.md");
    expect(out[0].project).toBe("Home Reno");
    // Intrinsic line data is untouched by a rename.
    expect(out[0].id).toBe("r1");
    expect(out[0].priority).toBe("HIGH");
    expect(out[0].line).toBe(recs[0].line);
  });

  it("keeps a non-project (ambient) file's records at project=null", () => {
    const recs = indexFileTodos("notes.md", "- [ ] Buy milk", {
      projectName: null,
    });
    const out = patchRecordsForRename(recs, "Archive/notes.md", "notes");
    expect(out[0].file).toBe("Archive/notes.md");
    expect(out[0].project).toBeNull();
  });
});

// ── The note block reaches the index ─────────────────────────────────────────

describe("indexFileTodos — note blocks", () => {
  const text = [
    "---",
    "marktodo: true",
    "---",
    "## Doing",
    "- [/] Demo old floor <!-- mt id=a2 -->",
    "    Dumpster is booked for Thursday.",
    "    Tile guy wants 2 days notice.",
    "- [ ] Order tile <!-- mt id=a5 -->",
    "## Backlog",
    "- [ ] Parent <!-- mt id=a7 -->",
    "    parent note",
    "    - [ ] Child <!-- mt id=a8 -->",
    "        child note",
  ].join("\n");

  const recs = indexFileTodos("Reno.md", text, {
    projectName: "Reno",
  });
  const byId = (id: string) => recs.find((r) => r.id === id)!;

  it("attaches the dedented note to the todo that owns it", () => {
    expect(byId("a2").note).toBe("Dumpster is booked for Thursday.\nTile guy wants 2 days notice.");
  });

  it("gives a todo with no note an empty string, not undefined", () => {
    expect(byId("a5").note).toBe("");
  });

  it("stops a parent's note at its first nested todo", () => {
    expect(byId("a7").note).toBe("parent note");
  });

  it("reads a nested todo's own note", () => {
    expect(byId("a8").note).toBe("child note");
  });

  it("does not turn note lines into todos", () => {
    expect(recs.map((r) => r.id)).toEqual(["a2", "a5", "a7", "a8"]);
  });

  it("keeps status and section right when a note sits between todos", () => {
    expect(statusOf(byId("a2"))).toBe("PROGRESS");
    expect(byId("a5").section).toBe("PROGRESS");
  });
});

describe("INDEX_FORMAT_KEY", () => {
  it("names every status label, so a MarkTodo-side rename moves it", () => {
    for (const st of STATUS_ORDER) expect(INDEX_FORMAT_KEY).toContain(STATUS_LABELS[st]);
  });
});
