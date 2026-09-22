/**
 * Folding status sections in a list. PURE.
 *
 * Which sections START folded depends on what the list is FOR, so the default
 * set is passed in rather than fixed here:
 *
 *  - a project or Todos list is a board you work across, so only finished work
 *    is out of the way (the app folds Done on a project screen too);
 *  - Agenda is "what am I on right now", so it opens on Doing alone and keeps
 *    the rest one click away.
 *
 * Either way `toggled` holds the statuses flipped AWAY from that default, so a
 * section you opened stays open and nothing else moves behind your back.
 */
import { STATUS_ORDER, type Status } from "../core/types";

/** Folded when a project / Todos list opens: finished work stays out of the way. */
export const DEFAULT_COLLAPSED_STATUSES: readonly Status[] = ["DONE"];

/** Folded when Agenda opens: everything except the work actually underway. */
export const AGENDA_COLLAPSED_STATUSES: readonly Status[] = STATUS_ORDER.filter(
  (s) => s !== "PROGRESS",
);

/** Whether a status section is folded, given the surface's default fold set. */
export function isStatusCollapsed(
  status: Status,
  toggled: readonly string[],
  defaults: readonly Status[] = DEFAULT_COLLAPSED_STATUSES,
): boolean {
  return defaults.includes(status) !== toggled.includes(status);
}

/** Flip one section. */
export function toggleStatusSection(toggled: readonly string[], status: Status): string[] {
  return toggled.includes(status) ? toggled.filter((s) => s !== status) : [...toggled, status];
}
