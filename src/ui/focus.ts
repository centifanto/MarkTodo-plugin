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

/** The focus row's label for a focus — the same word the segment shows. */
export function focusLabel(focus: Focus): string {
  return FOCUS_SEGMENTS.find((s) => s.key === focus)?.label ?? focus;
}

/** What the view bar's summary line says, and which parts it has to say it with. */
export interface FocusSummary {
  /** The focus in effect; null on a surface that has no focus (the Inbox). */
  focus: Focus | null;
  /** How many filters are set; null on a surface that offers none. */
  filters: number | null;
  /** The current sort's label; null on a surface that doesn't sort. */
  sort: string | null;
}

/** The separator between the summary's parts. */
const SUMMARY_SEP = " | ";

/**
 * The one-line reading of a collapsed focus row: `All | 0 filters | Manual`.
 *
 * Composed HERE, once, rather than assembled on each side — which parts there
 * are, their order, the separator and what each reads when empty are the same
 * sentence in both programs, and a collapsed control that describes itself
 * differently on two screens is worse than no control at all.
 *
 * A part that a surface does not offer is dropped, not written as "none": an
 * Inbox that has no sort should not have to say so. Zero filters DOES read as
 * "0 filters", because the count is the whole reason that part is there — the
 * row has to say the list is unfiltered, not leave you to infer it.
 */
export function focusSummary({ focus, filters, sort }: FocusSummary): string {
  const parts: string[] = [];
  if (focus !== null) parts.push(focusLabel(focus));
  if (filters !== null) parts.push(filters === 1 ? "1 filter" : `${filters} filters`);
  if (sort !== null) parts.push(sort);
  return parts.join(SUMMARY_SEP);
}
