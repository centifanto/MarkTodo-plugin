import { describe, it, expect } from "vitest";
import {
  labelTakenBy,
  nextStatusAliases,
  normalizeLabel,
  planRelabel,
} from "../../src/obsidian/labelMigration";
import { placeTodoInProject } from "../../src/obsidian/writeLogic";
import { indexFileTodos, indexFormatKey } from "../../src/obsidian/indexLogic";
import { DEFAULT_STATUS_LABELS as D, STATUS_ORDER, statusLabelLookup } from "../../src/core/types";

const note = [
  "---",
  "marktodo: true",
  "---",
  "## Kitchen",
  "### Doing",
  "- [/] demo floor <!-- mt id=a1 -->",
  "### Blocked",
  "- [!] waiting on tile <!-- mt id=a2 -->",
  "## Paused",
  "- [-] shelved <!-- mt id=a3 -->",
  "## Ideas",
  "- [x] shipped <!-- mt id=a4 -->",
];

describe("planRelabel", () => {
  it("renames a status heading and keeps its level", () => {
    const labels = { ...D, PROGRESS: "In progress" };
    const plan = planRelabel(note, D, {}, labels, nextStatusAliases(D, {}, labels));
    expect(plan.renamed).toBe(1);
    expect(plan.lines[4]).toBe("### In progress");
    expect(plan.collisions).toEqual([]);
  });

  it("lands a swap on the right headings (read with the old labels)", () => {
    // What the UI's three steps add up to: Blocked ↔ Paused.
    const labels = { ...D, BLOCKED: "Paused", PAUSED: "Blocked" };
    const plan = planRelabel(note, D, {}, labels, {});
    expect(plan.lines[6]).toBe("### Paused");
    expect(plan.lines[8]).toBe("## Blocked");
    // Re-read under the new labels, every todo still sits under its own status.
    const recs = indexFileTodos("P.md", plan.lines.join("\n"), { projectName: "P", statusLabels: labels });
    expect(recs.map((r) => [r.id, r.section])).toEqual([
      ["a1", "PROGRESS"],
      ["a2", "BLOCKED"],
      ["a3", "PAUSED"],
      ["a4", null],
    ]);
  });

  it("reports an ordinary heading that would become a status section", () => {
    const labels = { ...D, BACKLOG: "Ideas" };
    const plan = planRelabel(note, D, {}, labels, nextStatusAliases(D, {}, labels));
    expect(plan.collisions).toEqual(["Ideas"]);
    expect(plan.renamed).toBe(0);
  });

  it("treats a case-only change as a rename", () => {
    const labels = { ...D, DONE: "DONE" };
    expect(planRelabel(["## Done"], D, {}, labels, {}).lines).toEqual(["## DONE"]);
  });

  it("returns the same lines when nothing changes, and skips frontmatter", () => {
    const fm = ["---", "## Doing", "---", "## Doing"];
    const labels = { ...D, PROGRESS: "Now" };
    const plan = planRelabel(fm, D, {}, labels, {});
    expect(plan.lines).toEqual(["---", "## Doing", "---", "## Now"]);
    expect(planRelabel(note, D, {}, D, {}).lines).toBe(note);
  });

  it("renames headings still on an alias", () => {
    const aliases = { PROGRESS: ["Working"] };
    const plan = planRelabel(["## Working"], D, aliases, { ...D, PROGRESS: "Now" }, {});
    expect(plan.lines).toEqual(["## Now"]);
  });
});

describe("nextStatusAliases", () => {
  it("keeps a replaced label as an alias of its status", () => {
    expect(nextStatusAliases(D, {}, { ...D, PROGRESS: "In progress" })).toEqual({ PROGRESS: ["Doing"] });
  });

  it("appends newest last without repeats (case-insensitive)", () => {
    const a = nextStatusAliases({ ...D, PROGRESS: "Now" }, { PROGRESS: ["now", "Working"] }, { ...D, PROGRESS: "Active" });
    expect(a).toEqual({ PROGRESS: ["Working", "Now"] });
  });

  it("never keeps an alias equal to a label configured now, on any status", () => {
    // Step 1: Blocked → Tmp. Step 2: Paused → Blocked. Step 3: Tmp → Paused.
    const s1 = { ...D, BLOCKED: "Tmp" };
    const a1 = nextStatusAliases(D, {}, s1);
    const s2 = { ...s1, PAUSED: "Blocked" };
    const a2 = nextStatusAliases(s1, a1, s2);
    const s3 = { ...s2, BLOCKED: "Paused" };
    const a3 = nextStatusAliases(s2, a2, s3);
    expect(a3).toEqual({ BLOCKED: ["Tmp"] });
    const lookup = statusLabelLookup(s3, a3);
    expect(lookup.get("blocked")).toBe("PAUSED");
    expect(lookup.get("paused")).toBe("BLOCKED");
  });

  it("an unchanged set of labels keeps the aliases it had", () => {
    expect(nextStatusAliases(D, { DONE: ["Shipped"] }, D)).toEqual({ DONE: ["Shipped"] });
  });
});

describe("aliases in lookup, placement and the index", () => {
  const labels = { ...D, PROGRESS: "In progress" };
  const aliases = { PROGRESS: ["Doing"] };

  it("an alias heading still reads as its status", () => {
    const recs = indexFileTodos("P.md", note.join("\n"), { projectName: "P", statusLabels: labels, statusAliases: aliases });
    expect(recs.find((r) => r.id === "a1")?.section).toBe("PROGRESS");
  });

  it("a configured label beats an alias", () => {
    expect(statusLabelLookup({ ...D, PROGRESS: "Now", DONE: "Doing" }, { PROGRESS: ["Doing"] }).get("doing")).toBe("DONE");
  });

  it("placing a todo renames the alias heading it lands under", () => {
    const lines = ["## Doing", "- [/] a <!-- mt id=x -->", "## Done"];
    const out = placeTodoInProject(lines, 1, null, "PROGRESS", "- [/] a <!-- mt id=x -->", {
      statusLabels: labels,
      statusAliases: aliases,
      statusOrder: STATUS_ORDER,
    });
    expect(out).toEqual(["## In progress", "- [/] a <!-- mt id=x -->", "## Done"]);
  });

  it("aliases are part of the format key", () => {
    expect(indexFormatKey(labels, aliases)).not.toBe(indexFormatKey(labels));
  });
});

describe("labelTakenBy / normalizeLabel", () => {
  it("finds another status on the same label, case-insensitively", () => {
    expect(labelTakenBy(D, "BACKLOG", " done ")).toBe("DONE");
    expect(labelTakenBy(D, "DONE", "Done")).toBeNull();
  });

  it("blank means the default", () => {
    expect(normalizeLabel("PROGRESS", "   ")).toBe("Doing");
    expect(normalizeLabel("PROGRESS", " Now ")).toBe("Now");
  });
});
