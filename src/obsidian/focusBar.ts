/**
 * The focus segments — one segmented control: All · Plan · Active · Doing.
 *
 * What each segment MEANS is pure (`ui/focus.ts`); this is only the Obsidian
 * chrome for it. It is one part of the view bar (`viewBar.ts`), which owns the
 * collapse and draws the summary line naming the focus when collapsed.
 *
 * The track used to take the accent whenever focus wasn't "All" — a ring plus an
 * accent fill — on the grounds that a view hiding whole statuses has to say so.
 * It still has to say so, but the view bar's summary line now NAMES the focus in
 * words, which says it better than a colored border ever did. So the segments
 * draw in the neutral raised style at every focus, like the List/Kanban switch:
 * the selected segment is marked by its fill, and nothing else shouts.
 */
import { type TodoRecord } from "../core/types";
import { FOCUS_SEGMENTS, type Focus, focusCounts } from "../ui/focus";

export interface FocusBarOptions {
  /** The todos the counts are drawn from — the view's own set, already filtered. */
  todos: readonly TodoRecord[];
  focus: Focus;
  onPick: (focus: Focus) => void;
}

/** Render the focus segments into `parent` (which it empties first). */
export function buildFocusBar(parent: HTMLElement, opts: FocusBarOptions): void {
  const { todos, focus, onPick } = opts;
  parent.empty();
  const counts = focusCounts(todos);
  const track = parent.createDiv({
    cls: "marktodo-focus-switch",
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
