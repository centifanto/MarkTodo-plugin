/**
 * The focus row — one segmented control above every status-sectioned surface:
 * All · Plan · Active · Doing.
 *
 * What each segment MEANS is pure (`ui/focus.ts`); this is only the Obsidian
 * chrome for it. It is deliberately always visible rather than a toggle hidden
 * in a header: a view that is hiding whole statuses has to say so, and "just my
 * current work" should be one click from anywhere.
 *
 * "All" draws in the neutral raised style, every other segment in the accent —
 * so the control's color alone tells you whether what you're looking at is the
 * whole board or a slice of it.
 */
import { type TodoRecord } from "../core/types";
import { FOCUS_SEGMENTS, type Focus, focusCounts } from "../ui/focus";

export interface FocusBarOptions {
  /** The todos the counts are drawn from — the view's own set, already filtered. */
  todos: readonly TodoRecord[];
  focus: Focus;
  onPick: (focus: Focus) => void;
}

/** Render the focus row into `parent` (which it empties first). */
export function buildFocusBar(parent: HTMLElement, opts: FocusBarOptions): void {
  const { todos, focus, onPick } = opts;
  parent.empty();
  const counts = focusCounts(todos);
  const track = parent.createDiv({
    cls: `marktodo-focus-switch${focus === "all" ? "" : " is-narrowed"}`,
    attr: { role: "group", "aria-label": "Focus" },
  });
  for (const { key, label } of FOCUS_SEGMENTS) {
    const on = key === focus;
    const button = track.createEl("button", {
      cls: `marktodo-focus${on ? " is-active" : ""}`,
      attr: {
        "aria-pressed": String(on),
        title: key === "all" ? "Show every status" : `Show only ${label}`,
      },
    });
    button.createSpan({ cls: "marktodo-focus-label", text: label });
    button.createSpan({ cls: "marktodo-focus-count", text: String(counts[key]) });
    button.addEventListener("click", () => {
      if (key !== focus) onPick(key);
    });
  }
}
