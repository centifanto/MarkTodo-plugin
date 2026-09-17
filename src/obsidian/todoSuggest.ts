/**
 * The keyword popup. Type the configurable trigger at the END of any line —
 * plain text, a list item, a checkbox, or a blank line — and pick:
 *
 *  - Create todo here   — the line becomes a managed todo in place;
 *  - Open todo editor   — the todo editor's create mode, prefilled with the line;
 *  - Send to <note>     — only when a catch-all note is set: the line
 *                         moves there as a managed todo;
 *  - Edit todo…         — (only) when the line is already a managed todo.
 *
 * The `inlineDefaultAction` setting decides which is listed first. After
 * "here" or "catch-all" creates a todo, the todo editor opens on it when
 * `openEditorAfterCapture` is on (off by default). The pure
 * decisions (where the trigger may fire, the line→todo conversion, statuses,
 * option order) live in `inlineLogic.ts`.
 */
import {
  EditorSuggest,
  Notice,
  TFile,
  normalizePath,
  setIcon,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
} from "obsidian";
import { STATUS_GLYPH } from "../core/types";
import { serializeTodoLine } from "../core/serialize";
import { generateId } from "../core/id";
import {
  captureActions,
  captureStatus,
  findTrigger,
  lineToTodo,
  type CaptureAction,
} from "./inlineLogic";
import { openTodoModal, openTodoModalForLine } from "./todoModal";
import { openCaptureEditor, sendLineToNote } from "./quickAdd";
import { deleteEditorLine } from "./inlineTodo";
import { type Placement } from "./placement";
import type MarkTodoPlugin from "../../main";

const CAPSULE_TAIL = /^\s*(<!--\s*mt\s.*?-->)?\s*$/;

/** The hint beside "Create todo here": what kind of todo the line becomes. */
const HERE_NOTE: Record<Placement, string> = {
  project: "in this project",
  loose: "loose todo — shows in the Inbox",
};

const LABELS: Record<CaptureAction, { icon: string; text: string }> = {
  here: { icon: "square-check", text: "Create todo here" },
  editor: { icon: "square-pen", text: "Open todo editor…" },
  catchall: { icon: "inbox", text: "Send to catch-all note" },
  edit: { icon: "pencil", text: "Edit todo…" },
};

export class TodoSuggest extends EditorSuggest<CaptureAction> {
  constructor(private plugin: MarkTodoPlugin) {
    super(plugin.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const { inlineSuggestEnabled, inlineTrigger } = this.plugin.settings;
    if (!inlineSuggestEnabled || !inlineTrigger) return null;

    const line = editor.getLine(cursor.line);
    // The keyword ends the line (a managed line's hidden capsule may follow).
    if (!CAPSULE_TAIL.test(line.slice(cursor.ch))) return null;
    const hit = findTrigger(line.slice(0, cursor.ch), inlineTrigger);
    if (!hit) return null;
    return { start: { line: cursor.line, ch: hit.start }, end: cursor, query: hit.query };
  }

  getSuggestions(context: EditorSuggestContext): CaptureAction[] {
    const converted = this.convert(context);
    if (!converted) return [];
    const actions = captureActions({
      defaultAction: this.plugin.settings.inlineDefaultAction,
      catchAll: this.catchAllPath(context.file) !== null,
      managed: converted.todo.id !== null,
      blank: converted.todo.displayText.trim() === "",
    });
    const q = context.query.toLowerCase();
    return q ? actions.filter((a) => this.label(a).toLowerCase().includes(q)) : actions;
  }

  renderSuggestion(action: CaptureAction, el: HTMLElement): void {
    el.addClass("marktodo-suggest-item");
    setIcon(el.createSpan({ cls: "marktodo-suggest-icon" }), LABELS[action].icon);
    el.createSpan({ text: this.label(action) });
    if (action === "here" && this.context) {
      el.createSpan({
        cls: "marktodo-suggest-note",
        text: HERE_NOTE[this.plugin.fileKind(this.context.file)],
      });
    }
  }

  selectSuggestion(action: CaptureAction): void {
    const ctx = this.context;
    if (!ctx) return;
    const converted = this.convert(ctx);
    if (!converted) return;
    const { editor, file } = ctx;
    const lineNo = ctx.start.line;
    const placement = this.plugin.fileKind(file);
    const blank = converted.todo.displayText.trim() === "";

    // Every action consumes the trigger text first.
    const withoutTrigger = (
      editor.getLine(lineNo).slice(0, ctx.start.ch) + editor.getLine(lineNo).slice(ctx.end.ch)
    ).replace(/\s+$/, "");

    switch (action) {
      case "edit": {
        editor.setLine(lineNo, withoutTrigger);
        this.openEditor(file, lineNo, withoutTrigger);
        return;
      }
      case "here": {
        const status = captureStatus(
          placement,
          converted.todo,
          converted.wasTodo,
          this.plugin.settings.defaultStatus,
        );
        const todo = { ...converted.todo, glyph: STATUS_GLYPH[status], id: generateId() };
        if (blank) {
          // Nothing to edit yet: leave the cursor in the title slot instead.
          const head = `${todo.indent}${todo.bullet} [${todo.glyph}] `;
          editor.setLine(lineNo, `${head} <!-- mt id=${todo.id} -->`);
          editor.setCursor({ line: lineNo, ch: head.length });
          return;
        }
        const text = serializeTodoLine(todo);
        editor.setLine(lineNo, text);
        if (this.plugin.settings.openEditorAfterCapture) this.openEditor(file, lineNo, text);
        return;
      }
      case "editor": {
        editor.setLine(lineNo, withoutTrigger);
        const title = converted.todo.displayText;
        // One dialog: the editor IS the capture step, so nothing opens after it.
        openCaptureEditor(this.plugin, {
          title,
          onCaptured: () => {
            // Captured elsewhere → remove the source line, if it's still ours.
            if (!blank && editor.getLine(lineNo) === withoutTrigger) {
              deleteEditorLine(editor, lineNo);
            }
          },
        });
        return;
      }
      case "catchall": {
        const path = this.catchAllPath(file);
        if (path === null) return;
        editor.setLine(lineNo, withoutTrigger);
        void this.plugin.writer
          .ensureNote(path)
          .then((target) => (target ? sendLineToNote(this.plugin, editor, lineNo, target) : null))
          .then((sent) => {
            if (sent && this.plugin.settings.openEditorAfterCapture) openTodoModal(this.plugin, sent);
          });
        return;
      }
    }
  }

  /** The popup label for an action ("Send to <note>" names the catch-all note). */
  private label(action: CaptureAction): string {
    if (action !== "catchall") return LABELS[action].text;
    const path = this.plugin.settings.catchAllPath.trim();
    return `Send to ${(path.split("/").pop() ?? path).replace(/\.md$/i, "")}`;
  }

  /** The catch-all note's path when set and not the note being typed in, else null. */
  private catchAllPath(file: TFile | null): string | null {
    const raw = this.plugin.settings.catchAllPath.trim();
    if (!raw) return null;
    const path = normalizePath(/\.md$/i.test(raw) ? raw : `${raw}.md`);
    return file?.path === path ? null : path;
  }

  /** The trigger's line (trigger removed) as a todo, or null if it can't be one. */
  private convert(ctx: EditorSuggestContext): ReturnType<typeof lineToTodo> {
    return lineToTodo(ctx.editor.getLine(ctx.start.line), ctx.start.ch, ctx.end.ch);
  }

  /** Open the todo editor on a just-written line (the index may not have it yet). */
  private openEditor(file: TFile | null, line: number, text: string): void {
    if (!(file instanceof TFile)) {
      new Notice("MarkTodo: open a note to create a todo.");
      return;
    }
    openTodoModalForLine(this.plugin, file, line, text);
  }
}
