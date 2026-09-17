/**
 * The way back from Source. A project's Source mode is its note in
 * an ordinary markdown tab, so that tab needs the other half of the toggle:
 * List and Kanban buttons in its header, shown only while the tab is showing a
 * project note.
 *
 * Obsidian reuses one MarkdownView as you navigate between notes in a tab, so
 * the buttons are reconciled on `file-open` / `layout-change` / a metadata
 * change (the note may have just BECOME a project) rather than added once.
 */
import { MarkdownView, type WorkspaceLeaf } from "obsidian";
import { isProjectPath, openBoard, showInDashboard } from "./layout";
import type MarkTodoPlugin from "../../main";

const ACTIONS: ReadonlyArray<{ mode: "list" | "kanban"; icon: string; label: string }> = [
  { mode: "kanban", icon: "columns-3", label: "Kanban board" },
  { mode: "list", icon: "list", label: "Show in the dashboard" },
];

export function registerProjectNoteActions(plugin: MarkTodoPlugin): void {
  const added = new Map<MarkdownView, HTMLElement[]>();

  const clear = (view: MarkdownView): void => {
    for (const el of added.get(view) ?? []) el.remove();
    added.delete(view);
  };

  const sync = (leaf: WorkspaceLeaf): void => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const path = view.file?.path;
    const want = path !== undefined && isProjectPath(plugin, path);
    if (!want) {
      clear(view);
      return;
    }
    if (added.has(view)) return;
    // `addAction` prepends, so add in reverse of the order they should read.
    added.set(
      view,
      ACTIONS.map(({ mode, icon, label }) =>
        view.addAction(icon, label, () => {
          const current = view.file?.path;
          if (!current) return;
          // List: the dashboard's list column (the note stays open — it is yours).
          // Kanban: this same tab becomes the board.
          if (mode === "list") void showInDashboard(plugin, { kind: "project", path: current });
          else void openBoard(plugin, { kind: "project", path: current, mode: "kanban" }, leaf);
        }),
      ),
    );
  };

  const syncAll = (): void => {
    for (const view of [...added.keys()]) if (!view.leaf.parent) clear(view);
    plugin.app.workspace.iterateAllLeaves(sync);
  };

  plugin.app.workspace.onLayoutReady(syncAll);
  plugin.registerEvent(plugin.app.workspace.on("file-open", syncAll));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", syncAll));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", syncAll));
  plugin.register(() => {
    for (const view of [...added.keys()]) clear(view);
  });
}
