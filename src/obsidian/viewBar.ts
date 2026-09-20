/**
 * The view bar — ONE collapsible block above every todo surface, holding the
 * three controls that decide what you are looking at:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ All · Plan · Active · Doing           ⌄  │  focus segments
 *   ├────────────────────┬─────────────────────┤
 *   │ Filters            │ Sort                │  two columns
 *   │  Project  Tag …    │  Manual / Due / …   │
 *   └────────────────────┴─────────────────────┘
 *
 * Collapsed it is one line — `All | 0 filters | Manual` — and NOT nothing: a
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
import { type Focus, focusSummary } from "../ui/focus";
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
  toggle.createSpan({
    cls: "marktodo-viewbar-summary",
    text: focusSummary({
      focus: opts.focus?.current ?? null,
      filters: opts.filters ? activeFilterCount(opts.filters.state) : null,
      sort: opts.sort ? TODO_SORTS[opts.sort.current].label : null,
    }),
  });
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

  if (!opts.filters && !opts.sort) return;
  const columns = body.createDiv({ cls: "marktodo-viewbar-columns" });

  if (opts.filters) {
    const { state, surface, onChange } = opts.filters;
    const column = columns.createDiv({ cls: "marktodo-viewbar-column is-filters" });
    const heading = column.createDiv({ cls: "marktodo-viewbar-column-head" });
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
    column.createDiv({ cls: "marktodo-viewbar-column-head" }).createSpan({ text: "Sort" });
    const list = column.createDiv({ cls: "marktodo-sort-options", attr: { role: "group", "aria-label": "Sort" } });
    for (const option of sortOptions(surface, spansProjects)) {
      const on = option.key === current;
      const button = list.createEl("button", {
        cls: `marktodo-sort-option${on ? " is-active" : ""}`,
        attr: { "aria-pressed": String(on) },
      });
      button.createSpan({ text: option.label });
      button.addEventListener("click", () => {
        if (option.key !== current) onPick(option.key);
      });
    }
  }
}
