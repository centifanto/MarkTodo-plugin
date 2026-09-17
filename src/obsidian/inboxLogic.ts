/**
 * Pure data for the MarkTodo Inbox view. The Inbox
 * is a view, not a note: every todo outside a project, in two sections —
 *
 *  - Loose todos: managed todos in ordinary notes, grouped by note.
 *  - Unmanaged:   plain checkboxes in ordinary notes, grouped by note, each
 *                 one click from Convert (optional section, setting-gated).
 *
 * Checked-off todos are hidden, so the Inbox can actually reach empty; a todo
 * leaves the view when it's moved into a project. No Obsidian imports.
 */
import { statusOf, type TodoRecord } from "../core/types";
import { buildListGroups, type LabeledGroup } from "./viewData";

export interface InboxSections {
  loose: LabeledGroup[];
  unmanaged: LabeledGroup[];
  looseCount: number;
  unmanagedCount: number;
}

/** Split non-project, not-done todos into the Inbox view's sections. */
export function buildInboxSections(
  todos: readonly TodoRecord[],
  opts: { showUnmanaged: boolean },
): InboxSections {
  const open = todos.filter((t) => t.project === null && statusOf(t) !== "DONE");
  const loose = open.filter((t) => t.id !== null);
  const unmanaged = opts.showUnmanaged ? open.filter((t) => t.id === null) : [];
  return {
    loose: buildListGroups(loose, "note"),
    unmanaged: buildListGroups(unmanaged, "note"),
    looseCount: loose.length,
    unmanagedCount: unmanaged.length,
  };
}
