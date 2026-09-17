/**
 * View types from older versions, kept only so a saved workspace that still has
 * those tabs does not restore them as "plugin no longer active". Every LIST is
 * now part of the dashboard, so each list tab hands its place to the
 * dashboard's list column and closes; the old Kanban tab becomes the
 * Todos board.
 */
import { ItemView, type WorkspaceLeaf } from "obsidian";
import { type Selection } from "../../ui/dashboardNav";
import { VIEW_TYPES } from "../../ui/paneLayout";
import { showInDashboard } from "../layout";
import type MarkTodoPlugin from "../../../main";

/** Old list tab types → what the dashboard shows instead. */
export const LEGACY_LIST_TYPES: Readonly<Record<string, Selection>> = {
  "marktodo-inbox": { kind: "inbox" },
  "marktodo-today": { kind: "today" },
  "marktodo-list": { kind: "todos" },
};
export const LEGACY_BOARD_TYPE = "marktodo-board";

export class LegacyView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkTodoPlugin,
    private type: string,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return this.type;
  }

  getDisplayText(): string {
    return "MarkTodo";
  }

  async onOpen(): Promise<void> {
    // After the current `setViewState` settles — a leaf ignores a new one while
    // it is still opening this one.
    window.setTimeout(() => {
      if (this.type === LEGACY_BOARD_TYPE) {
        void this.leaf.setViewState({ type: VIEW_TYPES.todos });
        return;
      }
      const selection = LEGACY_LIST_TYPES[this.type];
      if (selection) void showInDashboard(this.plugin, selection).then(() => this.leaf.detach());
    }, 0);
  }
}
