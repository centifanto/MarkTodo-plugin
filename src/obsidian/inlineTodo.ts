/**
 * Inline managed-todo EDITOR GLUE, shared by
 * the EditorSuggest popup and the hotkey commands. These edit the ACTIVE editor
 * via the Editor API (cursor/fold-preserving — the guideline-preferred path for
 * the open note) rather than the Writer's Vault.process: there's no id-loss risk
 * here because we only ever ADD a capsule, never remove todos. The pure string
 * logic lives in `inlineLogic.ts`.
 */
import { Notice, type Editor, type EditorPosition } from "obsidian";
import { type Status } from "../core/types";
import { setStatus as coreSetStatus } from "../core/status";
import { generateId } from "../core/id";
import { parseTodoLine } from "../core/parse";
import { serializeTodoLine } from "../core/serialize";
import { managedScaffold, type InlineResult } from "./inlineLogic";

export { managedScaffold, type InlineResult } from "./inlineLogic";

/** Replace [start,end] with a managed todo scaffold; cursor lands in the title slot. */
export function insertManagedTodoAt(
  editor: Editor,
  start: EditorPosition,
  end: EditorPosition,
  status: Status,
): InlineResult {
  const { head, tail } = managedScaffold(status);
  editor.replaceRange(head + tail, start, end);
  editor.setCursor({ line: start.line, ch: start.ch + head.length });
  return { line: start.line, text: head + tail };
}

/** Command path: drop a managed todo on its own line at the cursor. */
export function insertManagedTodoLine(editor: Editor, status: Status): void {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  if (line.trim().length === 0) {
    insertManagedTodoAt(
      editor,
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length },
      status,
    );
  } else {
    const { head, tail } = managedScaffold(status);
    editor.replaceRange("\n" + head + tail, { line: cursor.line, ch: line.length });
    editor.setCursor({ line: cursor.line + 1, ch: head.length });
  }
}

/** Command path: stamp a capsule onto the current line if it's an unmanaged todo. */
export function convertCurrentLine(editor: Editor, forceStatus?: Status): void {
  const cursor = editor.getCursor();
  const todo = parseTodoLine(editor.getLine(cursor.line));
  if (!todo) {
    new Notice("MarkTodo: the cursor isn't on a todo line.");
    return;
  }
  if (todo.id !== null) {
    new Notice("MarkTodo: this todo is already managed.");
    return;
  }
  const converted = forceStatus === undefined ? todo : coreSetStatus(todo, forceStatus);
  editor.setLine(cursor.line, serializeTodoLine({ ...converted, id: generateId() }));
}

/** Remove line `n` entirely (including its line break), safe at EOF and line 0. */
export function deleteEditorLine(editor: Editor, n: number): void {
  const last = editor.lastLine();
  if (n < last) {
    editor.replaceRange("", { line: n, ch: 0 }, { line: n + 1, ch: 0 });
  } else if (n > 0) {
    editor.replaceRange(
      "",
      { line: n - 1, ch: editor.getLine(n - 1).length },
      { line: n, ch: editor.getLine(n).length },
    );
  } else {
    editor.setLine(0, "");
  }
}
