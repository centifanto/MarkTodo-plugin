/**
 * Folding status sections in a list. PURE.
 *
 * The app folds Done when a project screen opens; the plugin's Todos and
 * project lists do the same.
 */
import { type Status } from "../core/types";

/** Folded when a list opens (the app's `DEFAULT_COLLAPSED`): finished work stays out of the way. */
export const DEFAULT_COLLAPSED_STATUSES: readonly Status[] = ["DONE"];

/**
 * Whether a status section is folded. `toggled` holds the statuses flipped AWAY
 * from their default — the navigator's collapse memory works the same way — so
 * opening Done once keeps it open, and nothing else changes behind your back.
 */
export function isStatusCollapsed(status: Status, toggled: readonly string[]): boolean {
  return DEFAULT_COLLAPSED_STATUSES.includes(status) !== toggled.includes(status);
}

/** Flip one section. */
export function toggleStatusSection(toggled: readonly string[], status: Status): string[] {
  return toggled.includes(status) ? toggled.filter((s) => s !== status) : [...toggled, status];
}
