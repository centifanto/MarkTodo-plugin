/**
 * Plugin settings: shape and defaults. No Obsidian import, just data.
 */

import { type Status } from "../core/types";
import { type FilterState } from "./filterLogic";
import { DEFAULT_PROJECT_SORT, type ProjectSort } from "../ui/projectNav";
import { defaultArrangements, type SmartViewType, type TodayArrangement } from "../ui/smartViews";
import { type SortKey } from "../ui/sorts";
import { type DashboardLocation } from "../ui/paneLayout";
import {
  DEFAULT_SELECTION,
  NAV_COLUMN_PX,
  type NavSide,
  type PaneMode,
  type Selection,
  type SingleView,
} from "../ui/dashboardNav";
import { DEFAULT_APPEARANCE, DEFAULT_FONT_SCALE, type Appearance, type FontScale } from "../ui/theme";
import { DEFAULT_FOCUS, type Focus } from "../ui/focus";

/**
 * What the navigator pane remembers. Not a user-facing
 * setting — it is state the pane writes as you use it. Pins are NOT here: a pin
 * is a note flag (`marktodo-pinned`), so it syncs with the vault and the
 * companion app can set one. `collapsed` holds the sections toggled AWAY from
 * their default, so a new group never inherits a stale collapse.
 */
export interface NavMemory {
  sort: ProjectSort;
  collapsed: string[];
  /** What the dashboard's list column shows. */
  selected: Selection;
  /** In one-column mode, whether the list (not the navigation) is showing. */
  singleView: SingleView;
  /** The navigation column's width in two-column mode, px. */
  navWidth: number;
}

/** What a view remembers between openings: its last filters + bar state. */
export interface ViewMemory {
  filters: FilterState;
  /**
   * Whether the view bar is collapsed to its one-line summary. Default open:
   * the row names the focus, the filter count and the sort, and a control that
   * says what it is doing is only worth hiding once you have asked it to.
   */
  focusCollapsed: boolean;
  /** Status sections folded shut in the list, by status key. */
  sections: string[];
  /** Within-status ordering, by `ui/sorts.ts` key. Manual = file order. */
  sort: SortKey;
}

export interface MarkTodoSettings {
  /**
   * Optional catch-all note: the keyword popup can send lines here.
   * Empty = off (the popup offers two options). An ordinary loose note — no
   * special rules.
   */
  catchAllPath: string;
  /** Show the Unmanaged section (plain checkboxes, one-click Convert) in the MarkTodo Inbox. */
  inboxShowUnmanaged: boolean;
  /** Where the todo editor's destination starts: a project (last used) or today's daily note. */
  captureDestination: "project" | "daily";
  /** The project most recently captured into (preselected when destination = project). */
  lastCaptureProject: string;
  /** Status applied to new / adopted todos. */
  defaultStatus: Status;
  /** Keep status-section headers in sync inside project files. */
  maintainStatusHeaders: boolean;
  /** Allow kanban drag on mobile (else falls back to a tap menu). */
  mobileDragEnabled: boolean;
  /** Auto-move completed todos to the bottom of flat notes. */
  autoMoveCompleted: boolean;
  /** Folders excluded from ambient todo scanning (e.g. Templates, Archive). */
  excludedFolders: string[];
  /**
   * The MarkTodo folder: new projects go in `<it>/Projects`, archived
   * ones (when archiving moves notes) in `<it>/Archive`. It decides where things
   * are PUT, never how they are found — discovery stays frontmatter-based, so any
   * note anywhere is still a project. Never blank (`folderLogic.normalizeFolderRoot`).
   */
  markTodoFolder: string;
  /**
   * Derived from `markTodoFolder` on every load and save (`derivedFolders`), never
   * edited: the earlier two-folder setting, kept in data.json because the app reads them.
   */
  projectsFolder: string;
  archiveFolder: string;
  /**
   * Whether archiving also relocates the note into `archiveFolder`.
   * Shared, not device-local: if one program moved and the other only flagged,
   * the same vault would take two shapes depending on which device was last
   * touched. The FLAG is canonical; the folder is a materialized view the
   * plugin reconciles (the app has no SAF move).
   */
  archiveMovesNote: boolean;
  /** Show the inline EditorSuggest that creates a managed todo from a trigger. */
  inlineSuggestEnabled: boolean;
  /** Trigger string that opens the inline managed-todo picker (e.g. "mtodo"). */
  inlineTrigger: string;
  /**
   * The keyword popup's default (listed first): create the todo on the
   * line, open the todo editor, or send the line to the catch-all note.
   */
  inlineDefaultAction: "here" | "editor" | "catchall";
  /** Open the todo editor right after the keyword creates a todo (off by default). */
  openEditorAfterCapture: boolean;
  /** Restyle managed-todo checkboxes to the MarkTodo status icons in the editor. */
  styleManagedInEditor: boolean;
  /** Enter on a managed todo creates another managed todo (not a plain checkbox). */
  smartManagedEnter: boolean;
  /** Advanced: reveal the `<!-- mt id=… -->` capsule in Live Preview (hidden by default). */
  showCapsuleInEditor: boolean;
  /** Navigator pane state — not a user-facing setting. */
  nav: NavMemory;
  /**
   * Each Today segment's sort + group, remembered across openings. Per segment
   * because they ask different questions: Today wants status dividers, Recent
   * wants none (every row in it is Done).
   */
  todayArrangement: Record<SmartViewType, TodayArrangement>;
  /** Per-view memory keyed by view ("todos", "inbox", …) — not a user-facing setting. */
  viewMemory: Record<string, ViewMemory>;
  /**
   * The look of MarkTodo's own panes and dialogs — the app's theme,
   * or your Obsidian theme. The plugin's own; the app has separate settings.
   */
  appearance: Appearance;
  /** Where the dashboard (the navigator) lives. Default: left sidebar. */
  dashboardLocation: DashboardLocation;
  /**
   * The width in px of a dashboard living as a pane in the main area —
   * held through window resizes and sidebar toggles, changed only by dragging
   * its divider.
   */
  dashboardWidth: number;
  /**
   * Two columns (navigation + list, like Notebook Navigator) or one
   * column with a back button. Phones are always one column.
   */
  paneMode: PaneMode;
  /** Which side the navigation column sits on in two columns. */
  navSide: NavSide;
  /**
   * Which slice of the board every status-sectioned surface draws — everything,
   * one phase, or just Doing. Not a user-facing setting in the tab: the segment
   * row above each list writes it, and always shows what it is.
   *
   * Held across views on purpose. "Only what I'm working on" is a stance you
   * take for a stretch of work, not a per-view preference you would set six times.
   */
  focus: Focus;
  /**
   * How big MarkTodo's own text draws, as a multiplier on Obsidian's sizes.
   * Applies inside MarkTodo panes and dialogs only; the rest of Obsidian keeps
   * whatever your theme and Appearance settings give it.
   */
  fontScale: FontScale;
}

export const DEFAULT_SETTINGS: MarkTodoSettings = {
  catchAllPath: "",
  inboxShowUnmanaged: true,
  captureDestination: "project",
  lastCaptureProject: "",
  defaultStatus: "BACKLOG",
  maintainStatusHeaders: true,
  mobileDragEnabled: true,
  autoMoveCompleted: false,
  excludedFolders: [],
  markTodoFolder: "MarkTodo",
  projectsFolder: "MarkTodo/Projects",
  archiveFolder: "MarkTodo/Archive",
  archiveMovesNote: false,
  inlineSuggestEnabled: true,
  inlineTrigger: "mtodo",
  inlineDefaultAction: "here",
  openEditorAfterCapture: false,
  styleManagedInEditor: true,
  smartManagedEnter: true,
  showCapsuleInEditor: false,
  nav: {
    sort: DEFAULT_PROJECT_SORT,
    collapsed: [],
    selected: DEFAULT_SELECTION,
    singleView: "nav",
    navWidth: NAV_COLUMN_PX,
  },
  todayArrangement: defaultArrangements(),
  viewMemory: {},
  appearance: { ...DEFAULT_APPEARANCE },
  dashboardLocation: "left",
  dashboardWidth: 600,
  paneMode: "dual",
  navSide: "left",
  focus: DEFAULT_FOCUS,
  fontScale: DEFAULT_FONT_SCALE,
};
