/**
 * The view bar — ONE collapsible block above every todo surface, holding the
 * three controls that decide what you are looking at:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ All · Plan · Active · Doing           ⌄  │  focus segments
 *   ├──────────────┬──────────────┬────────────┤
 *   │ Filters      │ Sort         │ Group      │  the columns a
 *   │  Project Tag │  Manual/Due… │  None/Date…│  surface offers
 *   └──────────────┴──────────────┴────────────┘
 *
 * Collapsed it is one line — `List | All | 0 filters | Manual | Status` — and
 * NOT nothing: a
 * control that hides itself leaves you guessing why the list is short. The
 * sentence is composed by `ui/focus.ts`'s `focusSummary`, shared with the
 * companion app, so both programs read the same line back to you.
 *
 * Every part is optional, because the surfaces differ: the Inbox has no focus
 * (a loose todo can only be Backlog or Done) and no sort; a project's own list
 * has no project filter to offer; a board sorts by dragging, not by a picker.
 * A part a surface doesn't have is simply absent, here and in the summary.
 */
import { type App, setIcon } from "obsidian";
import { type TodoRecord } from "../core/types";
import { type Focus, focusSummaryParts, type SummaryPart } from "../ui/focus";
import {
  FILTERS_ICON,
  FOCUS_ICONS,
  GROUP_SETTING_ICON,
  LAYOUT_ICONS,
  SORT_ICONS,
  SORT_SETTING_ICON,
} from "./viewIcons";
import type { BoardMode } from "./views/todoSurface";
import { TODO_SORTS, sortOptions, type SortKey, type SortSurface } from "../ui/sorts";
import { buildFocusBar } from "./focusBar";
import { activeFilterCount, buildFilterFields, type FilterState, type FilterSurface } from "./filterBar";

export interface ViewBarOptions {
  app: App;
  /** The todos the filter options and focus counts are drawn from. */
  todos: readonly TodoRecord[];
  /** Focus segments; omit on a surface that has no focus. */
  focus?: { current: Focus; onPick: (focus: Focus) => void };
  /** Filter fields; omit on a surface that offers none. */
  filters?: {
    /** Mutated in place on every change. */
    state: FilterState;
    surface: FilterSurface;
    onChange: () => void;
  };
  /** Sort picker; omit on a surface that doesn't sort. */
  sort?: {
    current: SortKey;
    surface: SortSurface;
    /** False on one project's list, where ordering by project orders nothing. */
    spansProjects: boolean;
    onPick: (sort: SortKey) => void;
  };
  /**
   * Group-by picker; omit on a surface that groups one way only. Keyed by plain
   * strings rather than one surface's enum, so the bar stays the same component
   * on every surface and Agenda's groups don't have to be everyone's.
   */
  group?: {
    current: string;
    /** Pair a shared table with `viewIcons.withIcons` to fill these in. */
    options: ReadonlyArray<{ key: string; label: string; icon: string }>;
    onPick: (group: string) => void;
  };
  /**
   * What the layout switch in `lead` currently reads ("List", "Kanban",
   * "Source"). NAMED in the summary but not drawn by the bar: the switch is a
   * segmented control the surface already owns, and a collapsed line that
   * didn't say which layout you were in would leave the setting invisible.
   */
  layout?: { key: BoardMode; label: string };
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  /** Placed first in the head row (Todos puts its List/Kanban switch here). */
  lead?: HTMLElement;
}

/** Render the view bar into `containerEl` (which it empties first). */
export function buildViewBar(containerEl: HTMLElement, opts: ViewBarOptions): void {
  const { collapsed } = opts;
  containerEl.empty();
  const bar = containerEl.createDiv({ cls: `marktodo-viewbar${collapsed ? " is-collapsed" : ""}` });

  // ── head: the lead control, the summary line, the collapse toggle ─────────
  const head = bar.createDiv({ cls: "marktodo-viewbar-head" });
  if (opts.lead) {
    head.addClass("has-lead");
    head.appendChild(opts.lead);
  }

  const toggle = head.createEl("button", {
    cls: "marktodo-viewbar-toggle",
    attr: {
      "aria-expanded": String(!collapsed),
      "aria-label": collapsed ? "Show focus, filters and sort" : "Hide focus, filters and sort",
    },
  });
  // The summary reads at every state, not only when collapsed: expanded, it is
  // the heading that says what the controls below it currently add up to.
  //
  // DRAWN from the parts rather than printed as one sentence: each gets the icon
  // of the setting it speaks for, so a collapsed row is scannable instead of a
  // run of grey words. `focusSummaryParts` still decides which parts there are,
  // their order and their wording — shared with the companion app — so the two
  // programs cannot come to describe the same view differently.
  const summary = toggle.createSpan({ cls: "marktodo-viewbar-summary" });
  const parts = focusSummaryParts({
    layout: opts.layout?.label ?? null,
    focus: opts.focus?.current ?? null,
    filters: opts.filters ? activeFilterCount(opts.filters.state) : null,
    sort: opts.sort ? TODO_SORTS[opts.sort.current].label : null,
    group: opts.group ? (opts.group.options.find((g) => g.key === opts.group?.current)?.label ?? null) : null,
  });
  const partIcon = (part: SummaryPart): string => {
    switch (part) {
      case "layout":
        return LAYOUT_ICONS[opts.layout?.key ?? "list"];
      case "focus":
        return FOCUS_ICONS[opts.focus?.current ?? "all"];
      case "filters":
        return FILTERS_ICON;
      case "sort":
        return SORT_SETTING_ICON;
      case "group":
        return GROUP_SETTING_ICON;
    }
  };
  for (const { part, text } of parts) {
    const chip = summary.createSpan({ cls: `marktodo-viewbar-part is-${part}` });
    setIcon(chip.createSpan({ cls: "marktodo-viewbar-part-icon" }), partIcon(part));
    chip.createSpan({ text });
  }
  setIcon(
    toggle.createSpan({ cls: "marktodo-viewbar-chevron" }),
    collapsed ? "chevron-right" : "chevron-down",
  );
  toggle.addEventListener("click", () => opts.onToggleCollapsed(!collapsed));

  if (collapsed) return;

  // ── body: focus segments, then the Filters | Sort columns ────────────────
  const body = bar.createDiv({ cls: "marktodo-viewbar-body" });
  if (opts.focus) {
    buildFocusBar(body.createDiv({ cls: "marktodo-focus-bar" }), {
      todos: opts.todos,
      focus: opts.focus.current,
      onPick: opts.focus.onPick,
    });
  }

  if (!opts.filters && !opts.sort && !opts.group) return;
  const columns = body.createDiv({ cls: "marktodo-viewbar-columns" });

  if (opts.filters) {
    const { state, surface, onChange } = opts.filters;
    const column = columns.createDiv({ cls: "marktodo-viewbar-column is-filters" });
    const heading = column.createDiv({ cls: "marktodo-viewbar-column-head" });
    setIcon(heading.createSpan({ cls: "marktodo-viewbar-column-icon" }), FILTERS_ICON);
    heading.createSpan({ text: "Filters" });
    const clear = heading.createEl("button", {
      cls: "marktodo-filter-clear",
      attr: { "aria-label": "Clear filters" },
    });
    setIcon(clear, "x");
    clear.createSpan({ text: "Clear" });
    clear.toggleClass("is-hidden", activeFilterCount(state) === 0);

    const fields = buildFilterFields(column.createDiv({ cls: "marktodo-filter-fields" }), {
      app: opts.app,
      todos: opts.todos,
      state,
      surface,
      onChange,
    });
    clear.onclick = (): void => fields.clear();
  }

  if (opts.sort) {
    const { current, surface, spansProjects, onPick } = opts.sort;
    const column = columns.createDiv({ cls: "marktodo-viewbar-column is-sort" });
    const head = column.createDiv({ cls: "marktodo-viewbar-column-head" });
    setIcon(head.createSpan({ cls: "marktodo-viewbar-column-icon" }), SORT_SETTING_ICON);
    head.createSpan({ text: "Sort" });
    const list = column.createDiv({ cls: "marktodo-sort-options", attr: { role: "group", "aria-label": "Sort" } });
    for (const option of sortOptions(surface, spansProjects)) {
      const on = option.key === current;
      const button = list.createEl("button", {
        cls: `marktodo-sort-option${on ? " is-active" : ""}`,
        attr: { "aria-pressed": String(on) },
      });
      setIcon(button.createSpan({ cls: "marktodo-sort-icon" }), SORT_ICONS[option.key]);
      button.createSpan({ text: option.label });
      button.addEventListener("click", () => {
        if (option.key !== current) onPick(option.key);
      });
    }
  }

  if (opts.group) {
    const { current, options, onPick } = opts.group;
    const column = columns.createDiv({ cls: "marktodo-viewbar-column is-group" });
    const head = column.createDiv({ cls: "marktodo-viewbar-column-head" });
    setIcon(head.createSpan({ cls: "marktodo-viewbar-column-icon" }), GROUP_SETTING_ICON);
    head.createSpan({ text: "Group" });
    const list = column.createDiv({ cls: "marktodo-sort-options", attr: { role: "group", "aria-label": "Group" } });
    for (const option of options) {
      const on = option.key === current;
      const button = list.createEl("button", {
        cls: `marktodo-sort-option${on ? " is-active" : ""}`,
        attr: { "aria-pressed": String(on) },
      });
      setIcon(button.createSpan({ cls: "marktodo-sort-icon" }), option.icon);
      button.createSpan({ text: option.label });
      button.addEventListener("click", () => {
        if (option.key !== current) onPick(option.key);
      });
    }
  }
}
