/**
 * The List-or-Kanban body: a list in the dashboard's list column, a board in a
 * Todos or project tab.
 *
 * The mount / signature / drag wiring lives here once, so each view only
 * decides WHICH todos and what chrome sits above them.
 *
 * List re-mounts `TodoList` when its content changes (its drop zones seed once
 * per mount). Kanban mounts `Board` once and pushes columns through `setData`,
 * which the board ignores mid-drag. Either way an unchanged draw is
 * skipped by signature.
 */
import { Platform, setIcon } from "obsidian";
import { mount, unmount } from "svelte";
import TodoList from "../../ui/TodoList.svelte";
import Board from "../../ui/Board.svelte";
import { type BoardInstance, type Card } from "../../ui/boardTypes";
import { type Status, type TodoRecord } from "../../core/types";
import { LAYOUT_ICONS } from "../viewIcons";
import { groupsSignature } from "../../ui/viewSignature";
import { isManualSort, type SortKey } from "../../ui/sorts";
import { buildColumns, buildStatusSections } from "../viewData";
import { openTodoMenu, revealTodo } from "../todoMenu";
import { openTodoModal } from "../todoModal";
import type MarkTodoPlugin from "../../../main";

export interface SurfaceOptions {
  plugin: MarkTodoPlugin;
  /** Where the list or board mounts. */
  el: HTMLElement;
  /** Empty-state copy for the list. */
  emptyText: () => string;
  /** "+" on a status section or column; `anchor` is the button that was clicked. */
  onAdd: (status: Status, anchor?: Element) => void;
  /** Name each todo's project (Todos: yes; a project's own view: no). */
  showProject: boolean;
  /** `viewMemory` key the list's folded sections are remembered under. */
  memoryKey: string;
}

/** How a surface draws its todos. */
export type SurfaceMode = "list" | "kanban";
/** The modes a board tab's switch offers. List and Source leave the tab. */
export type BoardMode = SurfaceMode | "source";

export class TodoSurface {
  private list: ReturnType<typeof mount> | null = null;
  private boardComponent: ReturnType<typeof mount> | null = null;
  private board: BoardInstance | null = null;
  private mode: SurfaceMode | null = null;
  private signature: string | null = null;
  /**
   * Sections opened past the row cap, by section key — shared by this surface's
   * list and its board, because they are two drawings of one pile of todos.
   *
   * It lives HERE, not in `viewMemory` and not in the component: the component
   * re-mounts on every index change, and losing the rows you just asked for
   * because someone ticked a checkbox is its own kind of broken — while
   * remembering them on disk would let one click undo the cap for good. The
   * right lifetime is the visit, and a surface IS a visit.
   */
  private caps: Record<string, number> = {};

  constructor(private opts: SurfaceOptions) {}

  /**
   * Draw `todos` in `mode`; a no-op when the result would be identical.
   *
   * Focus and sort are read here rather than passed in, so every surface
   * narrows and orders the same way from the one place each is stored, and both
   * join the signature so changing either redraws (the todos themselves are
   * unchanged — only which sections exist and in what order they read).
   *
   * A BOARD is never sorted. Its ordering is the one you set by dragging cards,
   * which is the whole point of it; a sort would overwrite that with an order
   * nobody asked for and no drag could restore.
   */
  render(todos: TodoRecord[], mode: SurfaceMode): void {
    this.opts.el.toggleClass("is-kanban", mode === "kanban");
    const focus = this.opts.plugin.settings.focus;

    if (mode === "kanban") {
      const columns = buildColumns(todos, focus);
      const signature = JSON.stringify([
        mode,
        focus,
        groupsSignature(columns.map((c) => ({ label: c.label, todos: c.cards.map((card) => card.todo) }))),
      ]);
      if (signature === this.signature) return;
      if (this.mode !== "kanban") this.mountBoard();
      this.signature = signature;
      this.board?.setData(columns);
      return;
    }

    const sort = this.sort();
    const groups = buildStatusSections(todos, focus, sort);
    const signature = JSON.stringify([mode, focus, sort, this.opts.emptyText(), groupsSignature(groups)]);
    if (signature === this.signature) return;
    this.destroy();
    this.signature = signature;
    this.mode = "list";
    this.list = mount(TodoList, {
      target: this.opts.el,
      props: {
        groups,
        total: todos.length,
        emptyText: this.opts.emptyText(),
        showProject: this.opts.showProject,
        // Folding is remembered, but it is not a reason to re-mount: the list
        // already shows the new fold, so this only writes the memory.
        collapsed: this.opts.plugin.viewMemory(this.opts.memoryKey).sections,
        onToggleSection: (sections: string[]) => this.opts.plugin.rememberView(this.opts.memoryKey, { sections }),
        shown: this.caps,
        onShowMore: (shown: Record<string, number>) => {
          this.caps = shown;
        },
        onStatusClick: (todo: TodoRecord, event: MouseEvent) => openTodoMenu(this.opts.plugin, todo, event),
        onOpenTodo: (todo: TodoRecord, anchor?: Element) => openTodoModal(this.opts.plugin, todo, anchor),
        onReveal: (todo: TodoRecord) => void revealTodo(this.opts.plugin, todo),
        onAdd: (status: Status, anchor?: Element) => this.opts.onAdd(status, anchor),
        dragDisabled: this.dragDisabled() || !isManualSort(sort),
        onMove: (todo: TodoRecord, toStatus: Status) => void this.opts.plugin.writer.setStatus(todo, toStatus),
        onReorder: (todo: TodoRecord, anchor: TodoRecord, position: "before" | "after") =>
          void this.opts.plugin.writer.reorderTodo(todo, anchor, position),
      },
    });
  }

  /** Forget the last draw, so the next `render` rebuilds (a setting changed). */
  invalidate(): void {
    this.signature = null;
  }

  destroy(): void {
    if (this.list) void unmount(this.list);
    if (this.boardComponent) void unmount(this.boardComponent);
    this.list = null;
    this.boardComponent = null;
    this.board = null;
    this.mode = null;
    this.signature = null;
    this.opts.el.empty();
  }

  private mountBoard(): void {
    this.destroy();
    const { plugin } = this.opts;
    this.boardComponent = mount(Board, {
      target: this.opts.el,
      props: {
        dragDisabled: this.dragDisabled(),
        showProject: this.opts.showProject,
        // The same map the list uses: a status opened past the cap is open in
        // both, because it is one question about one pile of todos.
        shown: this.caps,
        onShowMore: (shown: Record<string, number>) => {
          this.caps = shown;
        },
        onMove: (card: Card, toStatus: Status) => void plugin.writer.setStatus(card.todo, toStatus),
        onReorder: (card: Card, anchor: Card, position: "before" | "after") =>
          void plugin.writer.reorderTodo(card.todo, anchor.todo, position),
        onCardMenu: (card: Card, event: MouseEvent) => openTodoMenu(plugin, card.todo, event),
        onOpenTodo: (todo: TodoRecord, anchor?: Element) => openTodoModal(plugin, todo, anchor),
        onReveal: (todo: TodoRecord) => void revealTodo(plugin, todo),
        onAdd: (status: Status, anchor?: Element) => this.opts.onAdd(status, anchor),
      },
    });
    this.board = this.boardComponent as unknown as BoardInstance;
    this.mode = "kanban";
  }

  /** This surface's remembered within-status order. */
  private sort(): SortKey {
    return this.opts.plugin.viewMemory(this.opts.memoryKey).sort;
  }

  private dragDisabled(): boolean {
    return Platform.isMobile && !this.opts.plugin.settings.mobileDragEnabled;
  }
}

/** The modes a toggle offers, in order. */
export const TODOS_MODES: ReadonlyArray<ModeOption<SurfaceMode>> = [
  { mode: "list", icon: LAYOUT_ICONS.list, label: "List" },
  { mode: "kanban", icon: LAYOUT_ICONS.kanban, label: "Kanban" },
];

export const PROJECT_MODES: ReadonlyArray<ModeOption<BoardMode>> = [
  ...TODOS_MODES,
  { mode: "source", icon: LAYOUT_ICONS.source, label: "Source" },
];

export interface ModeOption<M extends string> {
  mode: M;
  icon: string;
  label: string;
}

/** The List / Kanban (/ Source) segmented switch — the app's `SurfaceModeSwitch`. */
export function buildModeSwitch<M extends string>(
  parent: HTMLElement,
  options: ReadonlyArray<ModeOption<M>>,
  active: M,
  onPick: (mode: M) => void,
): HTMLElement {
  const el = parent.createDiv({ cls: "marktodo-mode-switch", attr: { role: "group", "aria-label": "View mode" } });
  for (const option of options) {
    const on = option.mode === active;
    const button = el.createEl("button", {
      cls: `marktodo-mode${on ? " is-active" : ""}`,
      attr: { "aria-pressed": String(on), title: `${option.label} view` },
    });
    setIcon(button.createSpan({ cls: "marktodo-mode-icon" }), option.icon);
    button.createSpan({ cls: "marktodo-mode-label", text: option.label });
    button.addEventListener("click", () => {
      if (option.mode !== active) onPick(option.mode);
    });
  }
  return el;
}
