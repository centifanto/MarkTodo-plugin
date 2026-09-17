/**
 * Compact filter bar for the standalone List & Board views. Quick single-select
 * filters so you can fine-tune what's shown without editing the note.
 *
 * Project and tag are searchable pickers (type to narrow — vaults outgrow a plain
 * dropdown fast); priority and managed are small fixed sets and stay dropdowns.
 * What the options are, per surface, lives in the pure `filterLogic.ts`; the
 * resulting state becomes a `QueryScope` for the pure `filterTodos`.
 */
import { AbstractInputSuggest, type App, DropdownComponent, setIcon } from "obsidian";
import { type Priority, type TodoRecord } from "../core/types";
import {
  type FilterOption,
  type FilterState,
  type FilterSurface,
  activeFilterCount,
  matchOptions,
  projectOptions,
  reconcileFilterState,
  tagOptions,
} from "./filterLogic";

export {
  type FilterState,
  type FilterSurface,
  filterByState,
  filterOptionsSignature,
  isFilterActive,
} from "./filterLogic";

const PRIORITY_OPTS: ReadonlyArray<readonly [Priority, string]> = [
  ["URGENT", "Urgent"],
  ["HIGH", "High"],
  ["LOW", "Low"],
];

/** The "no filter" row at the top of a picker's suggestions. */
const ALL: FilterOption = ["", "All"];

export interface FilterBarOptions {
  app: App;
  /** The todos the options are drawn from. */
  todos: readonly TodoRecord[];
  /** Mutated in place on every change. */
  state: FilterState;
  surface: FilterSurface;
  onChange: () => void;
  /** Start collapsed (only the Filters toggle, badge and Clear show). */
  collapsed?: boolean;
  /** Called when the user collapses/expands the bar (views remember it). */
  onToggleCollapsed?: (collapsed: boolean) => void;
  /** Placed first in the head row (Todos puts its List/Kanban switch here). */
  lead?: HTMLElement;
}

/** Render the filter bar into `containerEl`. */
export function buildFilterBar(containerEl: HTMLElement, opts: FilterBarOptions): void {
  const { app, todos, state, surface, onChange } = opts;
  reconcileFilterState(state, todos, surface);

  // Collapsible: a head row (toggle + active-count badge + Clear) that
  // stays visible, and a body with the pickers.
  const bar = containerEl.createDiv({ cls: "marktodo-filterbar" });
  const head = bar.createDiv({ cls: "marktodo-filterbar-head" });
  if (opts.lead) {
    head.addClass("has-lead");
    head.appendChild(opts.lead);
  }
  const toggle = head.createEl("button", {
    cls: "marktodo-filter-toggle clickable-icon",
    attr: { "aria-label": "Show or hide filters" },
  });
  const chevron = toggle.createSpan({ cls: "marktodo-filter-toggle-icon" });
  toggle.createSpan({ text: "Filters" });
  const badge = toggle.createSpan({ cls: "marktodo-filter-count" });
  const body = bar.createDiv({ cls: "marktodo-filterbar-body" });
  const resets: Array<() => void> = [];

  let collapsed = opts.collapsed ?? false;
  const paintCollapsed = (): void => {
    bar.toggleClass("is-collapsed", collapsed);
    setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
    toggle.setAttr("aria-expanded", String(!collapsed));
  };
  paintCollapsed();
  toggle.onclick = (): void => {
    collapsed = !collapsed;
    paintCollapsed();
    opts.onToggleCollapsed?.(collapsed);
  };

  const clear = createClearButton();
  const paintActive = (): void => {
    const n = activeFilterCount(state);
    clear.toggleClass("is-hidden", n === 0);
    head.toggleClass("has-active", n > 0);
    badge.setText(n > 0 ? String(n) : "");
    badge.toggleClass("is-hidden", n === 0);
  };
  const changed = (): void => {
    paintActive();
    onChange();
  };

  const cell = (label: string): HTMLElement => {
    const c = body.createDiv({ cls: "marktodo-filter" });
    c.createSpan({ cls: "marktodo-filter-label", text: label });
    return c;
  };

  const picker = (
    label: string,
    options: readonly FilterOption[],
    current: string | undefined,
    apply: (value: string | undefined) => void,
  ): void => {
    const wrap = cell(label).createDiv({ cls: "marktodo-picker" });
    const input = wrap.createEl("input", {
      cls: "marktodo-picker-input",
      attr: { type: "text", placeholder: "All", "aria-label": label, spellcheck: "false" },
    });
    setIcon(wrap.createSpan({ cls: "marktodo-picker-chevron" }), "chevron-down");

    let selected = current;
    const displayOf = (v: string | undefined): string =>
      v === undefined ? "" : (options.find(([ov]) => ov === v)?.[1] ?? "");
    const show = (): void => {
      input.value = displayOf(selected);
      wrap.toggleClass("is-set", selected !== undefined);
    };
    show();

    const suggest = new PickerSuggest(
      app,
      input,
      options,
      () => displayOf(selected),
      ([value]) => {
        selected = value || undefined;
        apply(selected);
        show();
        input.blur();
        changed();
      },
    );
    // Focus selects the text so typing replaces it; the suggestions show every
    // option until the query differs from the current selection.
    input.addEventListener("focus", () => {
      input.select();
      // Open the list on click/focus too, not only once the user types.
      input.dispatchEvent(new Event("input"));
    });
    input.addEventListener("blur", () => window.setTimeout(show, 0));
    wrap.addEventListener("mousedown", (e) => {
      if (e.target !== input) {
        e.preventDefault();
        input.focus();
      }
    });
    resets.push(() => {
      selected = undefined;
      suggest.close();
      show();
    });
  };

  const select = (
    label: string,
    options: ReadonlyArray<readonly [string, string]>,
    current: string,
    apply: (value: string) => void,
  ): void => {
    const d = new DropdownComponent(cell(label));
    d.addOption("", "All");
    for (const [value, display] of options) d.addOption(value, display);
    d.setValue(current);
    d.onChange((v) => {
      apply(v);
      changed();
    });
    resets.push(() => {
      d.setValue("");
    });
  };

  if (surface !== "loose") {
    picker("Project", projectOptions(todos, surface), state.project, (v) => {
      state.project = v;
    });
  }
  picker("Tag", tagOptions(todos), state.tag, (v) => {
    state.tag = v;
  });
  select("Priority", PRIORITY_OPTS, state.priority ?? "", (v) => {
    state.priority = v ? (v as Priority) : undefined;
  });
  // The Inbox view splits managed/unmanaged into sections itself.
  if (surface !== "loose") select(
    "Managed",
    [
      ["managed", "Managed"],
      ["unmanaged", "Unmanaged"],
    ] as const,
    state.managed === true ? "managed" : state.managed === false ? "unmanaged" : "",
    (v) => {
      state.managed = v === "managed" ? true : v === "unmanaged" ? false : undefined;
    },
  );

  head.appendChild(clear);
  paintActive();
  clear.onclick = (): void => {
    state.project = undefined;
    state.tag = undefined;
    state.priority = undefined;
    state.managed = undefined;
    for (const reset of resets) reset();
    changed();
  };
}

function createClearButton(): HTMLButtonElement {
  const clear = createEl("button", {
    cls: "marktodo-filter-clear",
    attr: { "aria-label": "Clear filters" },
  });
  setIcon(clear, "x");
  clear.createSpan({ text: "Clear" });
  return clear;
}

/** Type-to-narrow suggestions for one picker, with an "All" row on top. */
class PickerSuggest extends AbstractInputSuggest<FilterOption> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private options: readonly FilterOption[],
    private currentDisplay: () => string,
    private onPick: (option: FilterOption) => void,
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): FilterOption[] {
    // Still showing the current selection's text → the user hasn't typed yet.
    const q = query === this.currentDisplay() ? "" : query;
    const matches = matchOptions(this.options, q);
    return q ? matches : [ALL, ...matches];
  }

  renderSuggestion(option: FilterOption, el: HTMLElement): void {
    el.setText(option[1]);
    if (option === ALL) el.addClass("marktodo-picker-all");
  }

  selectSuggestion(option: FilterOption): void {
    this.onPick(option);
    this.close();
  }
}
