/**
 * Managed-todo rendering. Mostly CodeMirror 6 (Live Preview), plus one Reading-view
 * markdown post-processor — kept together because they share the generated icon
 * masks. All setting-gated, all read live settings (toggle without re-registering):
 *
 *  1. managedLineDecorations — tags managed todo LINES (those carrying an `mt`
 *     capsule) with `marktodo-managed` + a per-status class. It never touches
 *     Obsidian's own checkbox widget (replacing the same range would collide);
 *     CSS + the generated masks below restyle the checkbox to the MarkTodo look.
 *  2. hideCapsuleExtension — atomically hides the `mt` capsule in Live Preview
 *     except on the cursor's line, showing a small "edit todo" icon in its place.
 *  3. managedEnterExtension — pressing Enter at the end of a non-empty managed
 *     todo creates ANOTHER managed todo (fresh capsule) instead of a plain one.
 *  4. managedReadingCheckboxes — the Reading-view counterpart of (1)+(2): classes
 *     managed todo `<li>`s so the same masks apply (Reading view isn't CM6) and
 *     appends the edit icon.
 *  5. priorityAliasExtension — `@pu`/`@ph`/`@pl` expand as you type.
 *  6. managedCheckboxClick — clicking a managed checkbox (either surface) opens
 *     the status menu instead of Obsidian's native [ ]↔[x] toggle.
 */
import { ViewPlugin, Decoration, EditorView, WidgetType, keymap } from "@codemirror/view";
import type { DecorationSet, PluginValue, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, Prec, type Extension } from "@codemirror/state";
import {
  TFile,
  editorInfoField,
  setIcon,
  type MarkdownPostProcessorContext,
} from "obsidian";
import { openTodoModalForLine, todoRecordForLine } from "./todoModal";
import { openStatusMenu } from "./todoMenu";
import { STATUS_GLYPH, STATUS_ORDER, statusOf } from "../core/types";
import { glyphSvg } from "../ui/statusGlyphs";
import { generateId } from "../core/id";
import { parseTodoLine } from "../core/parse";
import { aliasExpansionAt } from "./inlineLogic";
import type MarkTodoPlugin from "../../main";

// ── 1. Managed-line decorations ────────────────────────────────────────────

/** ViewPlugin that adds a class to each visible managed todo line. */
export function managedLineDecorations(plugin: MarkTodoPlugin): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate): void {
        // The line class depends only on text + which lines are visible, not the
        // cursor — so we skip rebuilding on selection changes (every keystroke).
        if (u.docChanged || u.viewportChanged) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        if (!plugin.settings.styleManagedInEditor) return builder.finish();
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const todo = parseTodoLine(line.text);
            if (todo && todo.id !== null) {
              builder.add(
                line.from,
                line.from,
                Decoration.line({
                  class: `marktodo-managed marktodo-st-${statusOf(todo).toLowerCase()}`,
                }),
              );
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/**
 * The masks that turn managed checkboxes into the six MarkTodo status glyphs, as
 * `--marktodo-mask-<status>` custom properties: `url()`s generated from the same
 * shared geometry (`statusGlyphs.ts`) the views' icons use, so they match the
 * board exactly. styles.css applies each one to BOTH surfaces: Live Preview
 * (`.cm-line`) and Reading view (`li.task-list-item`, classed by
 * managedReadingCheckboxes).
 */
export function managedCheckboxMasks(): Record<string, string> {
  const masks: Record<string, string> = {};
  for (const status of STATUS_ORDER) {
    masks[`--marktodo-mask-${status.toLowerCase()}`] =
      `url("data:image/svg+xml;utf8,${encodeURIComponent(glyphSvg(status))}")`;
  }
  return masks;
}

/**
 * Set the checkbox masks on every window's `<body>` — the main one now, pop-outs
 * as they open — and clear them on unload. Obsidian doesn't allow plugins to add
 * `<style>` elements, so styles.css holds the rules and this supplies the values.
 */
export function registerManagedCheckboxMasks(plugin: MarkTodoPlugin): void {
  const masks = managedCheckboxMasks();
  const bodies = new Set<HTMLElement>();
  const apply = (body: HTMLElement): void => {
    body.setCssProps(masks);
    bodies.add(body);
  };
  apply(document.body);
  plugin.registerEvent(plugin.app.workspace.on("window-open", (win) => apply(win.doc.body)));
  plugin.register(() => {
    const cleared = Object.fromEntries(Object.keys(masks).map((key) => [key, ""]));
    for (const body of bodies) body.setCssProps(cleared);
  });
}

/**
 * Reading-view counterpart of managedLineDecorations: Obsidian renders managed
 * todos with native checkboxes there (no CM6). For each rendered todo `<li>`, look
 * up its SOURCE line via the section info and, when it's managed, add
 * `marktodo-managed` + the per-status class so the injected masks apply. Source
 * todo lines are zipped to rendered todo items in document order (depth-first
 * querySelectorAll matches source order, nesting included). Reuses the
 * `styleManagedInEditor` toggle — it's the same "managed checkboxes look like
 * status icons" feature, just the read-only surface.
 */
export function managedReadingCheckboxes(
  plugin: MarkTodoPlugin,
): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
  return (el, ctx) => {
    const items = Array.from(el.querySelectorAll<HTMLLIElement>("li.task-list-item"));
    if (items.length === 0) return;
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const todoLines = info.text
      .split("\n")
      .slice(info.lineStart, info.lineEnd + 1)
      .map((text, offset) => ({ text, line: info.lineStart + offset, todo: parseTodoLine(text) }))
      .filter((l) => l.todo !== null);
    items.forEach((li, i) => {
      const src = todoLines[i];
      if (!src?.todo || src.todo.id === null) return;
      const checkbox = li.querySelector<HTMLInputElement>(":scope > input.task-list-item-checkbox, :scope > p > input.task-list-item-checkbox");
      if (checkbox) readingCheckboxSource.set(checkbox, { path: ctx.sourcePath, line: src.line, text: src.text });
      if (plugin.settings.styleManagedInEditor) {
        li.classList.add("marktodo-managed", `marktodo-st-${statusOf(src.todo).toLowerCase()}`);
      }
      // The capsule never renders here, so the edit icon is appended to the item's
      // own text (before any nested sub-list).
      if (li.querySelector(":scope > .marktodo-inline-edit")) return;
      const icon = editTodoIcon((anchor) => {
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (file instanceof TFile) openTodoModalForLine(plugin, file, src.line, src.text, anchor);
      });
      const nested = li.querySelector(":scope > ul, :scope > ol");
      li.insertBefore(icon, nested);
    });
  };
}

/** Reading-view managed checkbox → its source line (set by managedReadingCheckboxes). */
const readingCheckboxSource = new WeakMap<HTMLInputElement, { path: string; line: number; text: string }>();

/**
 * Window-level CAPTURE click listener (register with `registerDomEvent(window,
 * "click", …, { capture: true })`): a click on a managed todo's checkbox opens
 * the status menu. Capture runs before Obsidian's own handlers — Live Preview
 * toggles on the checkbox's `input` event, Reading view on a delegated click —
 * so `preventDefault` (no toggle, hence no `input`) + `stopPropagation` (no
 * delegated click) leave the line untouched until a status is picked. Plain,
 * unmanaged checkboxes keep Obsidian's native toggle.
 */
export function managedCheckboxClick(plugin: MarkTodoPlugin): (e: MouseEvent) => void {
  return (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("input.task-list-item-checkbox")) return;

    let file: TFile | null = null;
    let line = -1;
    let text = "";
    const reading = readingCheckboxSource.get(target);
    if (reading) {
      const f = plugin.app.vault.getAbstractFileByPath(reading.path);
      if (f instanceof TFile) file = f;
      ({ line, text } = reading);
    } else {
      const editorEl = target.closest<HTMLElement>(".cm-editor");
      const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
      if (!view) return;
      file = view.state.field(editorInfoField, false)?.file ?? null;
      const docLine = view.state.doc.lineAt(view.posAtDOM(target));
      line = docLine.number - 1;
      text = docLine.text;
    }
    if (!file) return;
    const todo = todoRecordForLine(plugin, file, line, text);
    if (!todo || todo.id === null) return; // unmanaged → native toggle

    e.preventDefault();
    e.stopPropagation();
    openStatusMenu(plugin, todo, e);
  };
}

// ── 1b. Hide the `mt` capsule in Live Preview ──────────────────────────────

/** The capsule plus the single space before it, so hiding leaves no dangling gap. */
const CAPSULE_RE = /[ \t]*<!--\s*mt\s+.*?-->/;

/**
 * A small clickable "edit todo" icon (the todo editor from a note).
 * `onOpen` gets the icon's line (the editor line or list item) so the dialog
 * opens over the todo rather than centred.
 */
function editTodoIcon(onOpen: (anchor: Element) => void): HTMLElement {
  const el = createSpan({
    cls: "marktodo-inline-edit",
    attr: { role: "button", tabindex: "0", "aria-label": "Edit todo in MarkTodo" },
  });
  setIcon(el, "square-pen");
  // mousedown would otherwise move the cursor onto the line (revealing the capsule).
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen(lineOf(el));
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(lineOf(el));
    }
  });
  return el;
}

/** The note line an icon sits on: the Live Preview line or the Reading view list item. */
function lineOf(el: HTMLElement): Element {
  return el.closest(".cm-line, li") ?? el;
}

/** Live-Preview widget standing in for a hidden capsule. */
class EditTodoWidget extends WidgetType {
  constructor(
    private plugin: MarkTodoPlugin,
    private todoId: string,
  ) {
    super();
  }

  eq(other: EditTodoWidget): boolean {
    return other.todoId === this.todoId;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = editTodoIcon((anchor) => {
      const file = view.state.field(editorInfoField, false)?.file;
      if (!file) return;
      // Re-read the line at click time: the document may have shifted since render.
      const line = view.state.doc.lineAt(view.posAtDOM(el));
      openTodoModalForLine(this.plugin, file, line.number - 1, line.text, anchor);
    });
    return el;
  }

  ignoreEvent(): boolean {
    return true; // the icon handles its own clicks
  }
}

/**
 * Atomically hide the `<!-- mt id=… -->` capsule on managed todo lines in Live
 * Preview, EXCEPT on the line the cursor is on (so it stays editable) — the same
 * reveal-on-cursor behavior Obsidian uses for links/formatting marks. Off by
 * default-inverted: gated by `showCapsuleInEditor` (when true, we add no
 * decorations and the raw capsule shows). Reading view already omits HTML
 * comments, so this is only needed in the editor.
 */
export function hideCapsuleExtension(plugin: MarkTodoPlugin): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate): void {
        // Rebuild on edits, scroll, AND selection moves — the cursor-line reveal
        // depends on where the selection is.
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        if (plugin.settings.showCapsuleInEditor) return builder.finish();
        const sel = view.state.selection.main;
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const todo = parseTodoLine(line.text);
            if (todo && todo.id !== null) {
              const m = CAPSULE_RE.exec(line.text);
              // Reveal the capsule while the cursor/selection is on this line.
              const cursorOnLine = sel.from <= line.to && sel.to >= line.from;
              if (m && !cursorOnLine) {
                const start = line.from + m.index;
                // The hidden capsule's slot becomes a small "edit todo" link.
                builder.add(
                  start,
                  start + m[0].length,
                  Decoration.replace({ widget: new EditTodoWidget(plugin, todo.id) }),
                );
              }
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// ── 2. Smart Enter on a managed todo ───────────────────────────────────────

/** Keymap: Enter at the end of a non-empty managed todo → another managed todo. */
export function managedEnterExtension(plugin: MarkTodoPlugin): Extension {
  const run = (view: EditorView): boolean => {
    if (!plugin.settings.smartManagedEnter) return false;
    const { state } = view;
    if (state.selection.ranges.length !== 1) return false;
    const range = state.selection.main;
    if (!range.empty) return false;

    const line = state.doc.lineAt(range.head);
    if (range.head !== line.to) return false; // only at end of line

    const todo = parseTodoLine(line.text);
    if (!todo || todo.id === null) return false; // managed todos only
    if (todo.displayText.trim().length === 0) return false; // let Obsidian end empty items

    const status = plugin.settings.defaultStatus;
    const head = `${todo.indent}${todo.bullet} [${STATUS_GLYPH[status]}] `;
    const insert = `\n${head} <!-- mt id=${generateId()} -->`;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + 1 + head.length },
      userEvent: "input",
    });
    return true;
  };
  return Prec.highest(keymap.of([{ key: "Enter", run }]));
}

// ── 3. Priority alias expansion while typing ───────────────────────────────

/**
 * Typing a space right after `@pu` / `@ph` / `@pl` on any todo line expands the
 * alias to `@urgent` / `@high` / `@low` (quick entry, readable file).
 * Only a plain single-cursor space insert triggers it.
 */
export function priorityAliasExtension(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== " " || from !== to || view.state.selection.ranges.length !== 1) return false;
    const line = view.state.doc.lineAt(from);
    const exp = aliasExpansionAt(line.text, from - line.from);
    if (!exp) return false;
    const start = line.from + exp.from;
    view.dispatch({
      changes: { from: start, to: line.from + exp.to, insert: exp.insert + " " },
      selection: { anchor: start + exp.insert.length + 1 },
      userEvent: "input.type",
    });
    return true;
  });
}
