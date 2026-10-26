import { describe, expect, it } from "vitest";
import { indexFileTodos } from "../../src/obsidian/indexLogic";
import { editStepBlock, todoHierarchy, completeStepsOf } from "../../src/core/span";
import { filterTodos } from "../../src/core/query";
import { buildColumns, buildStatusSections } from "../../src/obsidian/viewData";
import { searchTodos } from "../../src/ui/dashboardNav";
import { projectCounts, looseOpenCount } from "../../src/ui/projectNav";
import { focusCounts } from "../../src/ui/focus";
import { smartViewTodos } from "../../src/ui/smartViews";
import { buildInboxSections } from "../../src/obsidian/inboxLogic";
import { planHeal, placeTodoInProject } from "../../src/obsidian/writeLogic";

const lines = [
  "## Doing",
  "- [/] Install sink <!-- mt id=parent01 -->",
  "    Parent note",
  "    - [ ] Buy fittings @high due @ 2026-01-01 <!-- mt id=legacy01 -->",
  "    - [x] Measure cabinet",
  "        - [ ] Verify clearance",
  "- [ ] Paint wall <!-- mt id=parent02 -->",
];
const records = () => indexFileTodos("House.md", lines.join("\n"), { projectName: "House" });

describe("plain checklist steps", () => {
  it("derives ancestry through notes, siblings and existing deeper checklists", () => {
    expect(records().map((r) => [r.line, r.parentLine, r.depth])).toEqual([
      [1, null, 0], [3, 1, 1], [4, 1, 1], [5, 4, 2], [6, null, 0],
    ]);
    expect(records()[0].steps.map((s) => [s.line, s.done])).toEqual([[3, false], [4, true], [5, false]]);
    expect(records()[0].note).toBe("Parent note");
  });

  it("blank lines and dedented prose end ownership just as they end a move span", () => {
    expect(todoHierarchy(["- [ ] Parent", "", "    - [ ] Separate"]).get(2)?.parentLine).toBeNull();
    expect(todoHierarchy(["- [ ] Parent", "prose", "    - [ ] Separate"]).get(2)?.parentLine).toBeNull();
    expect(todoHierarchy(["  - [ ] Indented root", "\t\t- [ ] Same-width root"]).get(1)?.parentLine).toBeNull();
  });

  it("completion stops at blank/dedent boundaries and leaves indentation and non-checkbox lines untouched", () => {
    const input = ["\t- [ ] Parent", "\t\t+ [ ] Step", "\t\t  note", "", "\t\t- [ ] Separate", "- [ ] Neighbor"];
    expect(completeStepsOf(input, 0)).toEqual([input[0], "\t\t+ [x] Step", ...input.slice(2)]);
    expect(input[1]).toBe("\t\t+ [ ] Step");
    expect(completeStepsOf(["- [ ] Parent", "- [ ] Neighbor", "    - [ ] Neighbor step"], 0))
      .toEqual(["- [ ] Parent", "- [ ] Neighbor", "    - [ ] Neighbor step"]);
  });

  it("does not give step tokens priority, dates, tags or links", () => {
    expect(records()[1]).toMatchObject({ priority: "NONE", due: null, tags: [], links: [] });
    expect(records()[1].displayText).toContain("@high due @ 2026-01-01");
  });

  it("keeps steps out of boards, status lists, filters and all project counts", () => {
    const all = records();
    expect(buildColumns(all).flatMap((c) => c.cards).map((c) => c.todo.line)).toEqual([6, 1]);
    expect(buildStatusSections(all).flatMap((g) => g.todos).map((t) => t.line)).toEqual([6, 1]);
    expect(filterTodos(all, {})).toHaveLength(2);
    expect(projectCounts(all, "2026-10-26").get("House")).toEqual({ open: 2, overdue: 0 });
    expect(focusCounts(all).all).toBe(2);
    expect(smartViewTodos(all, "agenda", "2026-10-26")).toEqual([]);
    const loose = all.map((r) => ({ ...r, project: null }));
    expect(looseOpenCount(loose, true)).toBe(2);
    const inbox = buildInboxSections(loose, { showUnmanaged: true });
    expect(inbox.looseCount + inbox.unmanagedCount).toBe(2);
  });

  it("search includes the parent context when only its step matches", () => {
    expect(searchTodos(records(), "fittings").map((r) => r.line)).toEqual([1, 3]);
    expect(searchTodos(records(), "clearance").map((r) => r.line)).toEqual([1, 4, 5]);
    expect(searchTodos(records().map((r) => ({ ...r, archived: true })), "fittings")).toEqual([]);
  });

  it("finds step text literally, including words that are tokens on parents", () => {
    expect(searchTodos(records(), "@high").map((r) => r.line)).toEqual([1, 3]);
  });

  it("toggles only the checkbox byte, preserving all existing text and capsules", () => {
    const step = records()[0].steps[0];
    const out = editStepBlock(lines, 1, step, { done: true })!;
    expect(out[3]).toBe(lines[3].replace("[ ]", "[x]"));
    expect(out.filter((_, i) => i !== 3)).toEqual(lines.filter((_, i) => i !== 3));
    expect(out.join("\n")).not.toContain("done @");
  });

  it("renames plain step text without normalizing tokens and keeps legacy IDs", () => {
    const out = editStepBlock(lines, 1, records()[0].steps[0], { text: "Check @high due @ 2026-1-1" })!;
    expect(out[3]).toBe("    - [ ] Check @high due @ 2026-1-1 <!-- mt id=legacy01 -->");
  });

  it("refuses stale, out-of-parent, empty and multiline step edits", () => {
    const step = records()[0].steps[0];
    expect(editStepBlock(lines, 6, step, { done: true })).toBeNull();
    expect(editStepBlock(lines, 1, { ...step, text: "changed" }, { done: true })).toBeNull();
    expect(editStepBlock(lines, 1, step, { text: "" })).toBeNull();
    expect(editStepBlock(lines, 1, step, { text: "a\n- [ ] b" })).toBeNull();
    expect(editStepBlock(lines, 1, step, { text: "<!-- mt id=forged -->" })).toBeNull();
  });

  it("deletes an owned step and its nested content without touching siblings", () => {
    const out = editStepBlock(lines, 1, records()[0].steps[1], { delete: true })!;
    expect(out).toEqual([...lines.slice(0, 4), lines[6]]);
  });

  it("status moves carry the checklist but never heal step glyphs from headings", () => {
    const prior = records();
    const out = placeTodoInProject(lines, 1, "DONE", "- [x] Install sink <!-- mt id=parent01 -->");
    const after = indexFileTodos("House.md", out.join("\n"), { projectName: "House" });
    expect(after.find((r) => r.id === "parent01")?.steps).toHaveLength(3);
    expect(planHeal(prior, after).some((op) => op.id === "legacy01")).toBe(false);
    expect(placeTodoInProject(lines, 3, "DONE", "bad")).toBe(lines);
  });
});
