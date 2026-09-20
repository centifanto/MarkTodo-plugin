import { describe, it, expect } from "vitest";
import {
  DEFAULT_FOCUS,
  FOCUS_SEGMENTS,
  focusCounts,
  focusLabel,
  focusStatuses,
  focusSummary,
  inFocus,
  parseFocus,
  type Focus,
} from "../../src/ui/focus";
import {
  PHASE_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_PHASE,
  statusesInPhase,
  type Status,
  type TodoRecord,
} from "../../src/core/types";
import { buildColumns, buildStatusSections } from "../../src/obsidian/viewData";

function rec(glyph: string, over: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: null,
    glyph,
    priority: "NONE",
    displayText: "todo",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    file: "P.md",
    line: 0,
    project: "P",
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
    ...over,
  };
}

/** One todo of every status, so a focus's statuses and its count agree. */
const ONE_EACH: TodoRecord[] = [
  rec(" "), // BACKLOG
  rec(">"), // WARMING
  rec("-"), // PAUSED
  rec("/"), // PROGRESS
  rec("!"), // BLOCKED
  rec("x"), // DONE
];

describe("the two phases", () => {
  it("splits STATUS_ORDER into Plan then Active, with nothing left over", () => {
    expect(statusesInPhase("PLAN")).toEqual(["BACKLOG", "WARMING", "PAUSED"]);
    expect(statusesInPhase("ACTIVE")).toEqual(["PROGRESS", "BLOCKED", "DONE"]);
    expect(PHASE_ORDER.flatMap(statusesInPhase)).toEqual([...STATUS_ORDER]);
  });

  it("keeps each phase contiguous in STATUS_ORDER, so a list reads as two halves", () => {
    const phases = STATUS_ORDER.map((s) => STATUS_PHASE[s]);
    // Exactly one boundary: no phase is interrupted by the other.
    expect(phases.filter((p, i) => i > 0 && p !== phases[i - 1])).toHaveLength(1);
  });

  it("orders the statuses Backlog, Warming, Paused, Doing, Blocked, Done", () => {
    expect(STATUS_ORDER.map((s) => STATUS_LABELS[s])).toEqual([
      "Backlog",
      "Warming",
      "Paused",
      "Doing",
      "Blocked",
      "Done",
    ]);
  });
});

describe("focus", () => {
  it("shows every status under All, and only Doing under Doing", () => {
    expect(focusStatuses("all")).toEqual([...STATUS_ORDER]);
    expect(focusStatuses("doing")).toEqual(["PROGRESS"]);
  });

  it("maps the phase segments onto their phases", () => {
    expect(focusStatuses("plan")).toEqual(statusesInPhase("PLAN"));
    expect(focusStatuses("active")).toEqual(statusesInPhase("ACTIVE"));
  });

  it("offers All, Plan, Active and the Doing label, in that order", () => {
    expect(FOCUS_SEGMENTS.map((s) => s.key)).toEqual(["all", "plan", "active", "doing"]);
    // The Doing segment reads from STATUS_LABELS, so it can never drift from
    // the section heading it isolates.
    expect(FOCUS_SEGMENTS[3].label).toBe(STATUS_LABELS.PROGRESS);
  });

  it("counts what each segment would show", () => {
    expect(focusCounts(ONE_EACH)).toEqual({ all: 6, plan: 3, active: 3, doing: 1 });
    expect(focusCounts([])).toEqual({ all: 0, plan: 0, active: 0, doing: 0 });
  });

  it("counts exactly the statuses it draws", () => {
    for (const { key } of FOCUS_SEGMENTS) {
      expect(focusCounts(ONE_EACH)[key]).toBe(focusStatuses(key).length);
      for (const st of STATUS_ORDER) {
        expect(inFocus(key, st)).toBe(focusStatuses(key).includes(st));
      }
    }
  });

  it("falls back to All for a stored value it doesn't know", () => {
    expect(parseFocus(undefined)).toBe(DEFAULT_FOCUS);
    expect(parseFocus("blocked")).toBe(DEFAULT_FOCUS);
    expect(parseFocus("doing")).toBe("doing");
    expect(DEFAULT_FOCUS).toBe("all");
  });
});

describe("focusSummary — the view bar's one-line reading", () => {
  // The plugin owns this composition so both programs say the same sentence;
  // these are the rules the app has to match.
  it("reads focus, then the filter count, then the sort", () => {
    expect(focusSummary({ focus: "all", filters: 0, sort: "Manual" })).toBe("All | 0 filters | Manual");
    expect(focusSummary({ focus: "doing", filters: 2, sort: "Due" })).toBe("Doing | 2 filters | Due");
  });

  it("says 0 filters rather than dropping the part — unfiltered is worth saying", () => {
    expect(focusSummary({ focus: "all", filters: 0, sort: null })).toBe("All | 0 filters");
  });

  it("singularizes one filter", () => {
    expect(focusSummary({ focus: "all", filters: 1, sort: null })).toBe("All | 1 filter");
  });

  it("drops a part the surface does not have, rather than writing 'none'", () => {
    // The Inbox: no focus, no sort.
    expect(focusSummary({ focus: null, filters: 0, sort: null })).toBe("0 filters");
    // A project's own list: no filters.
    expect(focusSummary({ focus: "all", filters: null, sort: "Title" })).toBe("All | Title");
    expect(focusSummary({ focus: null, filters: null, sort: null })).toBe("");
  });

  it("names the focus with the segment's own label, never the raw key", () => {
    for (const { key, label } of FOCUS_SEGMENTS) {
      expect(focusLabel(key)).toBe(label);
      expect(focusSummary({ focus: key, filters: null, sort: null })).toBe(label);
    }
  });
});

describe("focus narrows the surfaces", () => {
  const cases: Focus[] = ["all", "plan", "active", "doing"];

  it.each(cases)("%s: sections are exactly the statuses in focus", (focus) => {
    const sections = buildStatusSections(ONE_EACH, focus);
    expect(sections.map((s) => s.status as Status)).toEqual([...focusStatuses(focus)]);
    // Narrowing lifts whole sections out; it never thins the ones that remain.
    for (const section of sections) expect(section.todos).toHaveLength(1);
  });

  it.each(cases)("%s: board columns narrow the same way", (focus) => {
    expect(buildColumns([...ONE_EACH], focus).map((c) => c.status)).toEqual([...focusStatuses(focus)]);
  });

  it("tags each section and column with its phase, for the headings", () => {
    expect(buildStatusSections(ONE_EACH).map((s) => s.phase)).toEqual(
      STATUS_ORDER.map((s) => STATUS_PHASE[s]),
    );
    expect(buildColumns([...ONE_EACH]).map((c) => c.phase)).toEqual(
      STATUS_ORDER.map((s) => STATUS_PHASE[s]),
    );
  });

  it("defaults to showing everything when no focus is passed", () => {
    expect(buildStatusSections(ONE_EACH)).toEqual(buildStatusSections(ONE_EACH, "all"));
  });
});
