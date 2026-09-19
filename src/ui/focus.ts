/**
 * The focus segments — "what slice of the board am I looking at?". PURE.
 *
 * Four choices, in one row above every status-sectioned surface: everything,
 * one PHASE (Plan / Active), or the single status the work is actually in
 * (Doing). It narrows what a view DRAWS and nothing else — no todo is touched,
 * no note is written, and the row always shows which slice is in effect, so a
 * narrowed view can never be mistaken for an empty one.
 *
 * Deliberately not part of `FilterState`: the filter bar is per-view and
 * per-surface, while focus is one stance you hold across the whole dashboard.
 */
import { STATUS_LABELS, STATUS_ORDER, STATUS_PHASE, type Status, statusOf, type TodoRecord } from "../core/types";

export type Focus = "all" | "plan" | "active" | "doing";

export const DEFAULT_FOCUS: Focus = "all";

/** The statuses each focus shows, in STATUS_ORDER. */
const FOCUS_STATUSES: Record<Focus, readonly Status[]> = {
  all: STATUS_ORDER,
  plan: STATUS_ORDER.filter((s) => STATUS_PHASE[s] === "PLAN"),
  active: STATUS_ORDER.filter((s) => STATUS_PHASE[s] === "ACTIVE"),
  doing: ["PROGRESS"],
};

/**
 * The segments, left to right. "Doing" takes its label from `STATUS_LABELS` so
 * the segment and the section heading it isolates can never drift apart.
 */
export const FOCUS_SEGMENTS: ReadonlyArray<{ key: Focus; label: string }> = [
  { key: "all", label: "All" },
  { key: "plan", label: "Plan" },
  { key: "active", label: "Active" },
  { key: "doing", label: STATUS_LABELS.PROGRESS },
];

export function focusStatuses(focus: Focus): readonly Status[] {
  return FOCUS_STATUSES[focus];
}

/** Does this focus draw `status`? */
export function inFocus(focus: Focus, status: Status): boolean {
  return FOCUS_STATUSES[focus].includes(status);
}

/** How many of `todos` each segment would show — the counts on the row. */
export function focusCounts(todos: readonly TodoRecord[]): Record<Focus, number> {
  const counts: Record<Focus, number> = { all: 0, plan: 0, active: 0, doing: 0 };
  for (const todo of todos) {
    const status = statusOf(todo);
    for (const focus of Object.keys(counts) as Focus[]) {
      if (inFocus(focus, status)) counts[focus]++;
    }
  }
  return counts;
}

/** A stored focus, with anything unknown replaced by the default. */
export function parseFocus(raw: unknown): Focus {
  return FOCUS_SEGMENTS.some((s) => s.key === raw) ? (raw as Focus) : DEFAULT_FOCUS;
}
