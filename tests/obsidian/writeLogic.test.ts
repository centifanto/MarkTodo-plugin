import { describe, it, expect } from "vitest";
import { INDEX_FORMAT_KEY } from "../../src/obsidian/indexLogic";
import {
  statusOfHeading,
  parseHeadings,
  findTodoLine,
  managedIds,
  placeTodoInProject,
  subprojectOf,
  healDecision,
  planHeal,
  planSafeHeal,
  MAX_SECTION_WINS,
  reorderTodoLine,
  renameLegacyStatusHeadings,
} from "../../src/obsidian/writeLogic";
import { STATUS_LABELS, STATUS_ORDER, type Status, type TodoRecord } from "../../src/core/types";

const RENO = [
  "---",
  "marktodo: true",
  "---",
  "",
  "## Kitchen",
  "### Backlog",
  "- [ ] Pick countertop <!-- mt id=k1 -->",
  "### Doing",
  "- [/] Demo floor <!-- mt id=k2 -->",
  "### Done",
  "- [x] Order tile <!-- mt id=k3 -->",
];

describe("statusOfHeading", () => {
  it("matches the status labels case-insensitively", () => {
    expect(statusOfHeading("Doing")).toBe("PROGRESS");
    expect(statusOfHeading("  done  ")).toBe("DONE");
    expect(statusOfHeading("Kitchen")).toBeNull();
  });
});

describe("legacy Progress headings (Progress → Doing)", () => {
  const LEGACY = ["---", "marktodo: true", "---", "## Kitchen", "### Progress", "- [/] Demo <!-- mt id=k2 -->"];

  it("still reads `Progress` as the Doing section", () => {
    expect(statusOfHeading("progress")).toBe("PROGRESS");
  });

  it("renameLegacyStatusHeadings renames body headings, keeps level, returns the same array when clean", () => {
    const out = renameLegacyStatusHeadings(LEGACY);
    expect(out).toEqual(["---", "marktodo: true", "---", "## Kitchen", "### Doing", "- [/] Demo <!-- mt id=k2 -->"]);
    expect(renameLegacyStatusHeadings(out)).toBe(out);
  });

  it("a placement into a legacy note lands under the renamed section", () => {
    const lines = [...LEGACY, "### Done", "- [x] Tile <!-- mt id=k3 -->"];
    const result = placeTodoInProject(lines, 7, "Kitchen", "PROGRESS", "- [/] Tile <!-- mt id=k3 -->");
    expect(result).not.toContain("### Progress");
    expect(result.filter((l) => l === "### Doing")).toHaveLength(1);
    expect(result.indexOf("- [/] Tile <!-- mt id=k3 -->")).toBe(result.indexOf("### Doing") + 2);
    expect(managedIds(result.join("\n"))).toEqual(new Set(["k2", "k3"]));
  });
});

describe("parseHeadings", () => {
  it("classifies status vs subproject headings", () => {
    const h = parseHeadings(RENO);
    const kitchen = h.find((x) => x.text === "Kitchen")!;
    const progress = h.find((x) => x.text === "Doing")!;
    expect(kitchen.isStatus).toBe(false);
    expect(kitchen.level).toBe(2);
    expect(progress.isStatus).toBe(true);
    expect(progress.status).toBe("PROGRESS");
    expect(progress.level).toBe(3);
  });
});

describe("findTodoLine", () => {
  it("finds a managed todo by its capsule id", () => {
    expect(findTodoLine(RENO, { id: "k2", line: 99, displayText: "x", glyph: "y" })).toBe(8);
  });
  it("falls back to the stored line when it still matches", () => {
    const t = { id: null, line: 6, displayText: "Pick countertop", glyph: " " };
    // line 6 is managed (id=k1), so id mismatch — content scan won't match null id either
    expect(findTodoLine(RENO, t)).toBe(-1);
  });
  it("returns -1 when not found", () => {
    expect(findTodoLine(RENO, { id: "zzz", line: 0, displayText: "no", glyph: "!" })).toBe(-1);
  });
});

describe("managedIds", () => {
  it("collects all capsule ids", () => {
    expect(managedIds(RENO.join("\n"))).toEqual(new Set(["k1", "k2", "k3"]));
  });
});

describe("placeTodoInProject — subproject moves", () => {
  it("moves a todo into an existing status section in the same subproject", () => {
    const result = placeTodoInProject(RENO, 6, "Kitchen", "PROGRESS", "- [/] Pick countertop <!-- mt id=k1 -->");
    const progress = result.indexOf("### Doing");
    const done = result.indexOf("### Done");
    const k1 = result.findIndex((l) => l.includes("id=k1"));
    expect(k1).toBeGreaterThan(progress);
    expect(k1).toBeLessThan(done);
    expect(managedIds(result.join("\n"))).toEqual(new Set(["k1", "k2", "k3"]));
  });

  it("creates a missing status section in column order (Paused between Backlog and Doing)", () => {
    const result = placeTodoInProject(RENO, 6, "Kitchen", "PAUSED", "- [-] Pick countertop <!-- mt id=k1 -->");
    const backlog = result.indexOf("### Backlog");
    const paused = result.indexOf("### Paused");
    const progress = result.indexOf("### Doing");
    // STATUS_ORDER runs Backlog, Warming, Paused | Doing, Blocked, Done: Paused
    // is the last of the PLAN phase, so it lands ahead of Doing, not after it.
    expect(paused).toBeGreaterThan(backlog);
    expect(paused).toBeLessThan(progress);
    expect(result[paused + 1]).toContain("id=k1");
    expect(managedIds(result.join("\n"))).toEqual(new Set(["k1", "k2", "k3"]));
  });

  it("stays within its own subproject block (does not leak into Bathroom)", () => {
    const lines = [...RENO, "", "## Bathroom", "### Backlog", "- [ ] Tub <!-- mt id=bt -->"];
    const result = placeTodoInProject(lines, 6, "Kitchen", "BLOCKED", "- [!] Pick countertop <!-- mt id=k1 -->");
    // The new Blocked header must be inside Kitchen, before ## Bathroom.
    const blocked = result.indexOf("### Blocked");
    const bathroom = result.indexOf("## Bathroom");
    expect(blocked).toBeGreaterThan(-1);
    expect(blocked).toBeLessThan(bathroom);
    expect(managedIds(result.join("\n"))).toEqual(new Set(["k1", "k2", "k3", "bt"]));
  });
});

describe("placeTodoInProject — flat project (no subprojects)", () => {
  const FLAT = ["---", "marktodo: true", "---", "## Backlog", "- [ ] A <!-- mt id=a -->", "## Done", "- [x] B <!-- mt id=b -->"];

  it("moves into an existing top-level section", () => {
    const result = placeTodoInProject(FLAT, 4, null, "DONE", "- [x] A <!-- mt id=a -->");
    const done = result.indexOf("## Done");
    const a = result.findIndex((l) => l.includes("id=a"));
    expect(a).toBeGreaterThan(done);
    expect(managedIds(result.join("\n"))).toEqual(new Set(["a", "b"]));
  });

  it("creates a missing section AFTER the frontmatter (never at line 0)", () => {
    const small = ["---", "marktodo: true", "---", "## Backlog", "- [ ] A <!-- mt id=a -->"];
    const result = placeTodoInProject(small, 4, null, "PROGRESS", "- [/] A <!-- mt id=a -->");
    expect(result[0]).toBe("---");
    const prog = result.indexOf("## Doing");
    expect(prog).toBeGreaterThan(2);
    expect(result[prog + 1]).toContain("id=a");
  });
});

describe("placeTodoInProject — header level matches sibling status sections", () => {
  it("creates the new header at the existing status-section level, not subproject+1", () => {
    // Subproject is level 1, status sections are level 3 (unusual but valid).
    const lines = ["# Feature A", "### Backlog", "- [ ] X <!-- mt id=x1 -->"];
    const result = placeTodoInProject(
      lines,
      2,
      "Feature A",
      "PROGRESS",
      "- [/] X <!-- mt id=x1 -->",
    );
    expect(result).toContain("### Doing"); // not "## Doing"
    expect(result).not.toContain("## Doing");
    expect(managedIds(result.join("\n"))).toEqual(new Set(["x1"]));
  });
});

describe("placeTodoInProject — inserts snug under the section (regression: a move landed after the blank separator)", () => {
  // A realistic layout: a blank line separates Kitchen from Bathroom. A move
  // into Kitchen's Done section must tuck under the last todo, NOT after the blank.
  const REAL = [
    "## Kitchen",
    "### Backlog",
    "- [ ] Pick <!-- mt id=k1 -->",
    "### Doing",
    "- [/] Demo <!-- mt id=k2 -->",
    "### Done",
    "- [x] Order <!-- mt id=k3 -->",
    "",
    "## Bathroom",
    "### Backlog",
    "- [ ] Vanity <!-- mt id=b1 -->",
  ];

  it("places the moved todo directly after the section's last todo, not after a trailing blank", () => {
    const result = placeTodoInProject(REAL, 4, "Kitchen", "DONE", "- [x] Demo <!-- mt id=k2 -->");
    const order = result.findIndex((l) => l.includes("id=k3"));
    const demo = result.findIndex((l) => l.includes("id=k2"));
    expect(demo).toBe(order + 1); // snug — no blank between Order and Demo
    // The blank separator before ## Bathroom is preserved.
    const bathroom = result.indexOf("## Bathroom");
    expect(result[bathroom - 1].trim()).toBe("");
    expect(managedIds(result.join("\n"))).toEqual(new Set(["k1", "k2", "k3", "b1"]));
  });
});

function tr(
  id: string | null,
  glyph: string,
  section: Status | null,
  subproject: string | null = null,
): TodoRecord {
  return {
    id,
    glyph,
    priority: "NONE",
    displayText: "t",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    file: "P.md",
    line: 0,
    project: "P",
    subproject,
    section,
    note: "",
    projectGroup: null,
    archived: false,
  };
}

describe("subprojectOf — nearest non-status ancestor (fresh placement context)", () => {
  const lines = [
    "## Kitchen", // 0  subproject
    "### Doing", // 1  status
    "- [/] Demo", // 2  → Kitchen
    "## Backlog", // 3  top-level status section
    "- [ ] Flat", // 4  → null
  ];

  it("returns the nearest non-status ancestor heading", () => {
    expect(subprojectOf(lines, 2)).toBe("Kitchen");
  });
  it("returns null under a top-level status section", () => {
    expect(subprojectOf(lines, 4)).toBeNull();
  });
  it("returns null when there are no headings above the line", () => {
    expect(subprojectOf(["- [ ] x"], 0)).toBeNull();
  });
});

describe("planHeal — reconcile manual edits", () => {
  it("section-wins: a line moved under a new section heals the glyph", () => {
    const prior = [tr("a", " ", "BACKLOG")];
    const next = [tr("a", " ", "PROGRESS")]; // glyph unchanged, now under Doing
    expect(planHeal(prior, next)).toEqual([
      { id: "a", action: "section-wins", toStatus: "PROGRESS", subproject: null },
    ]);
  });

  it("glyph-wins: a changed glyph schedules a move under the matching section", () => {
    const prior = [tr("a", " ", "BACKLOG", "Kitchen")];
    const next = [tr("a", "/", "BACKLOG", "Kitchen")]; // user typed [/], still under Backlog
    expect(planHeal(prior, next)).toEqual([
      { id: "a", action: "glyph-wins", toStatus: "PROGRESS", subproject: "Kitchen" },
    ]);
  });

  it("no op when both changed consistently (e.g. our own UI write)", () => {
    const prior = [tr("a", " ", "BACKLOG")];
    const next = [tr("a", "/", "PROGRESS")];
    expect(planHeal(prior, next)).toEqual([]);
  });

  it("ignores a line dragged out of every section (no target to sync to)", () => {
    const prior = [tr("a", "/", "PROGRESS")];
    const next = [tr("a", "/", null)];
    expect(planHeal(prior, next)).toEqual([]);
  });

  it("ignores brand-new and id-less todos", () => {
    const prior = [tr("a", " ", "BACKLOG")];
    const next = [tr("a", " ", "BACKLOG"), tr("b", "/", "BACKLOG"), tr(null, "/", "BACKLOG")];
    expect(planHeal(prior, next)).toEqual([]); // 'a' unchanged, 'b' new, last id-less
  });
});

describe("planSafeHeal — the guards", () => {
  const F = INDEX_FORMAT_KEY;

  it("the format key covers every status label", () => {
    for (const st of STATUS_ORDER) expect(F).toContain(STATUS_LABELS[st]);
  });

  // The probe that found the bug: headings that change MEANING under unchanged
  // text must never rewrite a glyph. Labels are fixed now, so the only way the
  // meaning moves is a MarkTodo version that renames one — which moves the
  // format key, and a snapshot from before it is never diffed against one after.
  it("a snapshot from another format is never diffed", () => {
    const before = [tr("a1", "!", "BLOCKED"), tr("a2", "-", "PAUSED")];
    const after = [tr("a1", "!", "PAUSED"), tr("a2", "-", "BLOCKED")];
    expect(planHeal(before, after).map((op) => [op.id, op.toStatus])).toEqual([
      ["a1", "PAUSED"],
      ["a2", "BLOCKED"],
    ]);
    expect(planSafeHeal(before, after, "an older format", F)).toEqual({ ops: [], heldBack: 0 });
  });

  it("a first index (no prior format) plans nothing", () => {
    expect(planSafeHeal([tr("a", " ", "BACKLOG")], [tr("a", " ", "PROGRESS")], undefined, F).ops).toEqual([]);
  });

  it("a note that just became a project plans nothing", () => {
    const loose = { ...tr("a", " ", null), project: null };
    expect(planSafeHeal([loose], [tr("a", " ", "PROGRESS")], F, F).ops).toEqual([]);
  });

  it("a hand drag under the same format still heals", () => {
    expect(planSafeHeal([tr("a", " ", "BACKLOG")], [tr("a", " ", "PROGRESS")], F, F)).toEqual({
      ops: [{ id: "a", action: "section-wins", toStatus: "PROGRESS", subproject: null }],
      heldBack: 0,
    });
  });

  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i}`);

  it(`allows up to ${MAX_SECTION_WINS} section-wins at once`, () => {
    const prior = ids(MAX_SECTION_WINS).map((id) => tr(id, " ", "BACKLOG"));
    const next = ids(MAX_SECTION_WINS).map((id) => tr(id, " ", "DONE"));
    expect(planSafeHeal(prior, next, F, F)).toMatchObject({ heldBack: 0 });
    expect(planSafeHeal(prior, next, F, F).ops).toHaveLength(MAX_SECTION_WINS);
  });

  it("past the cap, withholds every section-wins but keeps glyph-wins", () => {
    const n = MAX_SECTION_WINS + 1;
    const prior = [...ids(n).map((id) => tr(id, " ", "BACKLOG")), tr("g", " ", "BACKLOG")];
    const next = [...ids(n).map((id) => tr(id, " ", "DONE")), tr("g", "/", "BACKLOG")];
    expect(planSafeHeal(prior, next, F, F)).toEqual({
      ops: [{ id: "g", action: "glyph-wins", toStatus: "PROGRESS", subproject: null }],
      heldBack: n,
    });
  });
});

describe("healDecision", () => {
  it("returns none when nothing relevant changed", () => {
    expect(healDecision("BACKLOG", "BACKLOG", "BACKLOG", "BACKLOG")).toBe("none");
  });
  it("section-wins when only the section moved", () => {
    expect(healDecision("BACKLOG", "BACKLOG", "PROGRESS", "BACKLOG")).toBe("section-wins");
  });
  it("glyph-wins when only the glyph changed", () => {
    expect(healDecision("BACKLOG", "BACKLOG", "BACKLOG", "DONE")).toBe("glyph-wins");
  });
  it("none when both changed but are now consistent", () => {
    expect(healDecision("BACKLOG", "BACKLOG", "DONE", "DONE")).toBe("none");
  });
  it("glyph-wins when both changed inconsistently", () => {
    expect(healDecision("BACKLOG", "BACKLOG", "PROGRESS", "DONE")).toBe("glyph-wins");
  });
});

describe("reorderTodoLine — within-column reorder", () => {
  const doc = [
    "## Kitchen",
    "### Backlog",
    "- [ ] A <!-- mt id=a -->",
    "- [ ] B <!-- mt id=b -->",
    "  - sub of B",
    "- [ ] C <!-- mt id=c -->",
    "### Doing",
    "- [/] P <!-- mt id=p -->",
    "## Bath",
    "### Backlog",
    "- [ ] D <!-- mt id=d -->",
  ];

  it("moves a todo before another in the same section", () => {
    expect(reorderTodoLine(doc, 5, 2, "before")!.slice(1, 6)).toEqual([
      "### Backlog",
      "- [ ] C <!-- mt id=c -->",
      "- [ ] A <!-- mt id=a -->",
      "- [ ] B <!-- mt id=b -->",
      "  - sub of B",
    ]);
  });

  it("carries sub-lines and never splits the anchor from its own", () => {
    expect(reorderTodoLine(doc, 3, 5, "after")!.slice(2, 6)).toEqual([
      "- [ ] A <!-- mt id=a -->",
      "- [ ] C <!-- mt id=c -->",
      "- [ ] B <!-- mt id=b -->",
      "  - sub of B",
    ]);
    expect(reorderTodoLine(doc, 2, 3, "after")!.slice(2, 6)).toEqual([
      "- [ ] B <!-- mt id=b -->",
      "  - sub of B",
      "- [ ] A <!-- mt id=a -->",
      "- [ ] C <!-- mt id=c -->",
    ]);
  });

  it("refuses anything that is not a pure reorder", () => {
    expect(reorderTodoLine(doc, 2, 7, "before")).toBeNull(); // other status
    expect(reorderTodoLine(doc, 2, 10, "before")).toBeNull(); // other subproject block
    expect(reorderTodoLine(doc, 2, 2, "before")).toBeNull(); // itself
    expect(reorderTodoLine(doc, 2, 3, "before")).toBeNull(); // already there → no change
    expect(reorderTodoLine(doc, 0, 2, "before")).toBeNull(); // not a todo
  });

  it("keeps every managed id", () => {
    const out = reorderTodoLine(doc, 10 - 5, 2, "before")!;
    expect(managedIds(out.join("\n"))).toEqual(managedIds(doc.join("\n")));
  });
});

// ── A todo is its line PLUS what is indented under it ─────────────────────────

describe("placeTodoInProject — carries the todo's note block", () => {
  const WITH_NOTE = [
    "---",
    "marktodo: true",
    "---",
    "## Backlog",
    "- [ ] Demo floor <!-- mt id=a1 -->",
    "    Dumpster booked for Thursday.",
    "    Asbestos test came back clean.",
    "## Done",
    "- [x] Order tile <!-- mt id=a2 -->",
  ];

  it("moves the note with the todo, in order, under the new section", () => {
    const result = placeTodoInProject(
      WITH_NOTE,
      4,
      null,
      "DONE",
      "- [x] Demo floor <!-- mt id=a1 -->",
    );
    const done = result.indexOf("## Done");
    const a1 = result.findIndex((l) => l.includes("id=a1"));
    expect(a1).toBeGreaterThan(done);
    expect(result[a1 + 1]).toBe("    Dumpster booked for Thursday.");
    expect(result[a1 + 2]).toBe("    Asbestos test came back clean.");
  });

  it("leaves no orphan note lines behind in the old section", () => {
    const result = placeTodoInProject(
      WITH_NOTE,
      4,
      null,
      "DONE",
      "- [x] Demo floor <!-- mt id=a1 -->",
    );
    const backlog = result.indexOf("## Backlog");
    const done = result.indexOf("## Done");
    // Everything between the two headers must be gone — the note went with the todo.
    expect(result.slice(backlog + 1, done)).toEqual([]);
    expect(result.filter((l) => l.includes("Dumpster")).length).toBe(1);
  });

  it("keeps every managed id (the note carries none of its own)", () => {
    const result = placeTodoInProject(
      WITH_NOTE,
      4,
      null,
      "DONE",
      "- [x] Demo floor <!-- mt id=a1 -->",
    );
    expect(managedIds(result.join("\n"))).toEqual(new Set(["a1", "a2"]));
  });

  it("carries nested sub-items too, and keeps their ids", () => {
    const lines = [
      "## Backlog",
      "- [ ] Parent <!-- mt id=p1 -->",
      "    the note",
      "    - [ ] Child <!-- mt id=c1 -->",
      "## Done",
    ];
    const result = placeTodoInProject(lines, 1, null, "DONE", "- [x] Parent <!-- mt id=p1 -->");
    const p1 = result.findIndex((l) => l.includes("id=p1"));
    expect(result[p1 + 1]).toBe("    the note");
    expect(result[p1 + 2]).toBe("    - [ ] Child <!-- mt id=c1 -->");
    expect(managedIds(result.join("\n"))).toEqual(new Set(["p1", "c1"]));
  });

  it("carries the note when it has to create the status section", () => {
    const lines = ["## Backlog", "- [ ] A <!-- mt id=a -->", "    a note"];
    const result = placeTodoInProject(lines, 1, null, "DONE", "- [x] A <!-- mt id=a -->");
    const a = result.findIndex((l) => l.includes("id=a"));
    expect(result[a - 1]).toBe("## Done");
    expect(result[a + 1]).toBe("    a note");
  });

  it("accepts explicit subLines for an insert with no source line (cross-note move)", () => {
    const lines = ["## Backlog", "- [ ] Existing <!-- mt id=e -->"];
    const result = placeTodoInProject(
      lines,
      -1,
      null,
      "BACKLOG",
      "- [ ] Arrived <!-- mt id=n -->",
      ["    carried note"],
    );
    const n = result.findIndex((l) => l.includes("id=n"));
    expect(result[n + 1]).toBe("    carried note");
    expect(managedIds(result.join("\n"))).toEqual(new Set(["e", "n"]));
  });

  it("is unchanged for a todo with no note — single-line move, as before", () => {
    const lines = ["## Backlog", "- [ ] A <!-- mt id=a -->", "## Done"];
    const result = placeTodoInProject(lines, 1, null, "DONE", "- [x] A <!-- mt id=a -->");
    expect(result).toEqual(["## Backlog", "## Done", "- [x] A <!-- mt id=a -->"]);
  });
});
