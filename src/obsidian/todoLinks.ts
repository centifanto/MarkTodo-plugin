/**
 * Live links inside MarkTodo's own dialogs.
 *
 * A todo's text is ordinary markdown, so `[[a note]]`, `[label](https://…)` and
 * a bare URL mean what they mean everywhere else in Obsidian. `ui/format.ts`
 * cuts a title into segments; this renders those segments into an element and
 * opens the ones that are links.
 *
 * Note links go through MarkTodo's own `openNote`, not `Workspace.openLinkText`:
 * the dashboard owns its tab group, and `openLinkText` would happily open a note
 * inside it. A `#heading` in a link opens the right note and ignores the anchor —
 * the alternative is losing the layout rule, which is the worse trade.
 */
import { type App, Notice, TFile } from "obsidian";
import { titleSegments, type TitleSegment } from "../ui/format";
import { openNote } from "./layout";
import type MarkTodoPlugin from "../../main";

/** Open one link segment. Plain-text segments are not links and do nothing. */
export function openTodoLink(plugin: MarkTodoPlugin, segment: TitleSegment, sourcePath: string): void {
  if (segment.kind === "url") {
    window.open(segment.target, "_blank");
    return;
  }
  if (segment.kind !== "note") return;
  const file = resolveNoteLink(plugin.app, segment.target, sourcePath);
  if (file === null) {
    new Notice(`MarkTodo: no note matches "${segment.target}".`);
    return;
  }
  void openNote(plugin, file.path);
}

/** The note a link points at, or null when the vault has none. */
function resolveNoteLink(app: App, target: string, sourcePath: string): TFile | null {
  // `Note#Heading` / `Note#^block` resolve by the path in front of the anchor.
  const linkpath = target.split("#")[0].trim();
  if (linkpath === "") return null;
  const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  return file instanceof TFile ? file : null;
}

/**
 * Render `displayText` into `parent` as text plus working links. Returns the
 * number of links drawn, so a caller can tell a plain title from a linked one.
 */
export function renderLinkedText(
  parent: HTMLElement,
  displayText: string,
  plugin: MarkTodoPlugin,
  sourcePath: string,
  /**
   * Called when a NOTE link is followed — a dialog uses it to close, since the
   * note it just opened is behind the dialog and a modal blocks the workspace.
   * External links don't call it: the browser takes focus and the dialog is
   * still the thing you were working in.
   */
  onNavigate?: () => void,
): number {
  let links = 0;
  for (const segment of titleSegments(displayText)) {
    if (segment.kind === "text") {
      parent.appendText(segment.text);
      continue;
    }
    links++;
    const external = segment.kind === "url";
    const anchor = parent.createEl("a", {
      cls: `marktodo-link${external ? " is-external" : " is-internal"}`,
      text: segment.text,
      href: external ? segment.target : "#",
      attr: { title: segment.target, ...(external ? { rel: "noopener" } : {}) },
    });
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      // The title itself is click-to-edit; a link click is not an edit.
      event.stopPropagation();
      openTodoLink(plugin, segment, sourcePath);
      if (!external) onNavigate?.();
    });
  }
  return links;
}
