/**
 * Writer — all file mutations go through `Vault.process` (atomic
 * read-modify-write). The pure algorithms live in writeLogic.ts; this is the
 * thin Obsidian glue.
 *
 * Safety net: every edit diffs the set of managed todo ids before/after and
 * ABORTS (no write) if any todo other than the one being edited would vanish —
 * a move-logic bug can at worst no-op, never eat a todo. `remember()` records
 * our own write hashes so the heal rule can distinguish plugin writes from
 * manual edits.
 *
 * Line endings: files are split on `\r?\n` and rejoined with the file's detected
 * EOL, so CRLF (Windows) vaults round-trip without being silently converted.
 */
import { type App, Notice, TFile, normalizePath } from "obsidian";
import { type Priority, type Status, type Todo, type TodoRecord, statusOf } from "../core/types";
import { setStatus as coreSetStatus, setPriority as coreSetPriority } from "../core/status";
import { setDue as coreSetDue, syncDoneDate, localIsoDate } from "../core/dates";
import { setTitle as coreSetTitle } from "../core/title";
import { serializeTodoLine } from "../core/serialize";
import { parseTodoLine } from "../core/parse";
import { generateId } from "../core/id";
import { itemEndOf, setNoteBlock } from "../core/span";
import { type MarkTodoSettings } from "./settings";
import {
  findTodoLine,
  placeTodoInProject,
  subprojectOf,
  managedIds,
  reorderTodoLine,
  type HealOp,
} from "./writeLogic";
import { isProjectFrontmatter } from "./projects";
import { deletesOnComplete, readNoteMeta } from "../core/noteMeta";
import { buildCaptureLine } from "./inlineLogic";
import { statusRefusal } from "./placement";
import { fnv1a } from "./hash";

/** Split into lines (EOL-agnostic) and remember the file's line ending. */
function splitEol(data: string): { lines: string[]; eol: string } {
  return { lines: data.split(/\r?\n/), eol: data.includes("\r\n") ? "\r\n" : "\n" };
}

export class Writer {
  private selfWrites = new Set<string>();

  constructor(
    private app: App,
    private getSettings: () => MarkTodoSettings,
  ) {}

  /** Did we write this exact (path, content)? Used by the heal rule's guard. */
  wasSelfWrite(path: string, hash: string): boolean {
    return this.selfWrites.has(`${path}:${hash}`);
  }

  private remember(path: string, text: string): void {
    this.selfWrites.add(`${path}:${fnv1a(text)}`);
    if (this.selfWrites.size > 64) {
      const first = this.selfWrites.values().next().value;
      if (first !== undefined) this.selfWrites.delete(first);
    }
  }

  private fileFor(todo: TodoRecord): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(todo.file);
    return f instanceof TFile ? f : null;
  }

  private async applyEdit(
    todo: TodoRecord,
    transform: (t: Todo) => Todo,
    move: { toStatus: Status } | null,
  ): Promise<boolean> {
    const file = this.fileFor(todo);
    if (!file) return false;
    // Project-hood is explicit — only the frontmatter key counts, and only
    // deliberate creation/conversion sets it.
    const fileIsProject = this.isProjectFile(file);
    // Status rules: every status in a project, check-off only in
    // any other note. This is the single choke point — menu, modal, board drag,
    // anything — so no UI path can bypass it.
    if (move !== null) {
      const refusal = statusRefusal(fileIsProject ? "project" : "loose", move.toStatus);
      if (refusal !== null) {
        new Notice(`MarkTodo: ${refusal}`);
        return false;
      }
    }
    let ok = false;

    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      const idx = findTodoLine(lines, todo);
      if (idx === -1) return data;

      const current = parseTodoLine(lines[idx]);
      if (!current) return data;

      // Any action adopts the todo (stamps an id) if it doesn't have one.
      const withId: Todo = current.id ? current : { ...current, id: generateId() };
      // A status change keeps the `done @` stamp in step with the glyph.
      const updated =
        move !== null
          ? syncDoneDate(transform(withId), localIsoDate(new Date()))
          : transform(withId);
      const newLine = serializeTodoLine(updated);

      const settings = this.getSettings();
      const useSections =
        move !== null && settings.maintainStatusHeaders && fileIsProject;

      // Cleanup: completing a todo in a `marktodo-cleanup: delete` note
      // removes it, span and all. Note-scoped and opt-in, so a note without the
      // key never loses a line — and `deletesOnComplete` keeps an archived note
      // safe whatever its policy says. Checked independently of project-hood:
      // the throwaway todos live in daily notes, which are loose.
      const cleanupDelete =
        move !== null &&
        move.toStatus === "DONE" &&
        deletesOnComplete(readNoteMeta(this.app.metadataCache.getFileCache(file)?.frontmatter));

      let result: string;
      if (cleanupDelete) {
        const work = lines.slice();
        work.splice(idx, itemEndOf(work, idx) - idx);
        result = work.join(eol);
      } else if (useSections && move) {
        // Recompute the subproject from CURRENT lines — the snapshot's value can
        // be stale (e.g. the note was converted to a project after its last index).
        const subproject = subprojectOf(lines, idx);
        result = placeTodoInProject(lines, idx, subproject, move.toStatus, newLine).join(eol);
      } else {
        lines[idx] = newLine;
        result = lines.join(eol);
      }

      // Safety invariant: no managed todo (other than the edited one) may vanish.
      const before = managedIds(data);
      const after = managedIds(result);
      const editedId = updated.id as string;
      for (const id of before) {
        if (id !== editedId && !after.has(id)) {
          new Notice("MarkTodo: write aborted (safety check). No changes made.");
          return data;
        }
      }
      // A cleanup delete is the one case where the edited todo is MEANT to
      // disappear; every other write that loses it is a bug.
      if (!cleanupDelete && !after.has(editedId)) {
        new Notice("MarkTodo: write aborted (safety check). No changes made.");
        return data;
      }
      if (cleanupDelete) {
        new Notice("MarkTodo: completed and removed (this note's cleanup is set to delete).");
      }

      ok = true;
      this.remember(file.path, result);
      return result;
    });

    return ok;
  }

  setStatus(todo: TodoRecord, status: Status): Promise<boolean> {
    return this.applyEdit(todo, (t) => coreSetStatus(t, status), { toStatus: status });
  }

  /**
   * Reconcile manual edits in a project file (the heal rule). Applies
   * the ops from `planHeal` in ONE atomic pass: `section-wins` rewrites the glyph
   * to match the section the user dropped the line under; `glyph-wins` moves the
   * line under the section matching the glyph the user typed. The result is
   * `remember()`-ed so the re-index it triggers is recognized as our own write
   * and doesn't heal again (no feedback loop). Same abort-on-id-loss
   * guard as every other write.
   */
  async applyHeal(file: TFile, ops: HealOp[]): Promise<void> {
    if (ops.length === 0) return;
    const settings = this.getSettings();
    if (!settings.maintainStatusHeaders) return;
    const today = localIsoDate(new Date());
    await this.app.vault.process(file, (data) => {
      const before = managedIds(data);
      const { eol } = splitEol(data);
      let lines = splitEol(data).lines;

      for (const op of ops) {
        const idx = lines.findIndex(
          (l) => l.includes(`id=${op.id}`) && parseTodoLine(l) !== null,
        );
        if (idx === -1) continue;
        const cur = parseTodoLine(lines[idx]);
        if (!cur) continue;
        if (op.action === "section-wins") {
          lines[idx] = serializeTodoLine(syncDoneDate(coreSetStatus(cur, op.toStatus), today));
        } else {
          // glyph-wins: the glyph is already what the user typed; move the line
          // under the section matching it — verbatim unless the `done @` stamp
          // must follow the new glyph (e.g. the box was ticked natively).
          const synced = syncDoneDate(cur, today);
          const line = synced === cur ? lines[idx] : serializeTodoLine(synced);
          lines = placeTodoInProject(lines, idx, op.subproject, op.toStatus, line);
        }
      }

      const result = lines.join(eol);
      const after = managedIds(result);
      for (const id of before) {
        if (!after.has(id)) {
          new Notice("MarkTodo: status headings not synced (safety check). No changes made.");
          return data;
        }
      }
      this.remember(file.path, result);
      return result;
    });
  }

  private isProjectFile(file: TFile): boolean {
    return isProjectFrontmatter(this.app.metadataCache.getFileCache(file)?.frontmatter);
  }

  /**
   * The note at `path`, created (with parent folders) when missing — for the
   * catch-all note. Null when something non-note sits at the path.
   */
  async ensureNote(path: string): Promise<TFile | null> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) return existing;
    if (existing !== null) {
      new Notice(`MarkTodo: "${normalized}" exists but isn't a note.`);
      return null;
    }
    const segments = normalized.split("/").slice(0, -1);
    let dir = "";
    for (const seg of segments) {
      dir = dir ? `${dir}/${seg}` : seg;
      if (this.app.vault.getAbstractFileByPath(dir) === null) {
        await this.app.vault.createFolder(dir);
      }
    }
    return this.app.vault.create(normalized, "");
  }

  /**
   * Capture from the todo editor's create mode: a fresh managed
   * todo in `target` — under its status section when the note is a project,
   * else appended as a loose BACKLOG todo. Priority/due of `undefined` keep
   * what the title says. Returns the written line, or null.
   */
  async captureTodo(opts: {
    title: string;
    target: TFile;
    status: Status;
    priority?: Priority;
    due?: string | null;
  }): Promise<string | null> {
    const line = buildCaptureLine({
      title: opts.title,
      priority: opts.priority,
      due: opts.due,
      status: this.isProjectFile(opts.target) ? opts.status : "BACKLOG",
      id: generateId(),
    });
    if (line === null) {
      new Notice("MarkTodo: nothing to capture — give the todo a title.");
      return null;
    }
    return (await this.insertIntoTarget(opts.target, line)) ? line : null;
  }

  /**
   * Insert a todo line into a note: under its status section when the note is
   * a project with header sync on, else appended snug after the last content
   * line. Shared by capture, send-to-note, and move.
   */
  async insertIntoTarget(
    target: TFile,
    line: string,
    subLines: readonly string[] = [],
  ): Promise<boolean> {
    let inserted = false;
    await this.app.vault.process(target, (data) => {
      const { lines, eol } = splitEol(data);
      const settings = this.getSettings();
      const todo = parseTodoLine(line);

      let result: string;
      if (this.isProjectFile(target) && settings.maintainStatusHeaders && todo) {
        result = placeTodoInProject(lines, -1, null, statusOf(todo), line, subLines).join(eol);
      } else {
        while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
        lines.push(line, ...subLines, "");
        result = lines.join(eol);
      }
      inserted = true;
      this.remember(target.path, result);
      return result;
    });
    return inserted;
  }

  /**
   * Rewrite the todo's note block. Not an `applyEdit`: the todo
   * LINE is untouched, so there is no transform, no `done @` sync and no status
   * move — only the lines under it change.
   */
  async setNote(todo: TodoRecord, note: string): Promise<boolean> {
    const file = this.fileFor(todo);
    if (!file) return false;
    let ok = false;
    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      const idx = findTodoLine(lines, todo);
      if (idx === -1) return data;
      const next = setNoteBlock(lines, idx, note);
      if (next === null) {
        // Unchanged, or refused (a line that would become a sub-todo or forge a
        // capsule). Refusal is silent-safe: nothing is written either way.
        return data;
      }
      const result = next.join(eol);
      // The note carries no ids, so any id loss here means the span maths went
      // wrong — abort rather than write it.
      const after = managedIds(result);
      for (const id of managedIds(data)) {
        if (!after.has(id)) {
          new Notice("MarkTodo: note not saved (safety check). No changes made.");
          return data;
        }
      }
      ok = true;
      this.remember(file.path, result);
      return result;
    });
    return ok;
  }

  setPriority(todo: TodoRecord, priority: Priority): Promise<boolean> {
    return this.applyEdit(todo, (t) => coreSetPriority(t, priority), null);
  }

  /** Rewrite the todo's title, keeping its priority/due/done tokens. */
  setTitle(todo: TodoRecord, title: string): Promise<boolean> {
    return this.applyEdit(todo, (t) => coreSetTitle(t, title), null);
  }

  setDue(todo: TodoRecord, date: string | null): Promise<boolean> {
    return this.applyEdit(todo, (t) => coreSetDue(t, date), null);
  }

  adopt(todo: TodoRecord): Promise<boolean> {
    return this.applyEdit(todo, (t) => t, null);
  }

  /**
   * Within-column reorder: move `todo` directly before/after
   * `anchor` in the same note, keeping status, section and subproject (pure
   * `reorderTodoLine`). Cards from different notes can't be ordered relative
   * to each other in any file, so that's a no-op with a notice.
   */
  async reorderTodo(
    todo: TodoRecord,
    anchor: TodoRecord,
    position: "before" | "after",
  ): Promise<boolean> {
    if (todo.file !== anchor.file) {
      new Notice("MarkTodo: todos from different notes keep their own order.");
      return false;
    }
    const file = this.fileFor(todo);
    if (!file) return false;
    let ok = false;
    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      const from = findTodoLine(lines, todo);
      const at = findTodoLine(lines, anchor);
      if (from === -1 || at === -1) return data;
      const out = reorderTodoLine(lines, from, at, position);
      if (out === null) return data;
      const result = out.join(eol);
      const after = managedIds(result);
      for (const id of managedIds(data)) {
        if (!after.has(id)) {
          new Notice("MarkTodo: write aborted (safety check). No changes made.");
          return data;
        }
      }
      ok = true;
      this.remember(file.path, result);
      return result;
    });
    return ok;
  }

  /**
   * Delete a todo's line. Only that line goes — any indented
   * lines under it stay — and the same safety net applies: the write aborts if
   * any OTHER managed todo would vanish.
   */
  async deleteTodo(todo: TodoRecord): Promise<boolean> {
    const file = this.fileFor(todo);
    if (!file) return false;
    let ok = false;
    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      const idx = findTodoLine(lines, todo);
      if (idx === -1) return data;
      const removedId = parseTodoLine(lines[idx])?.id ?? null;
      // Delete the span, so the todo's note goes with it rather than
      // dangling under the heading. If the span holds ANOTHER managed todo (a
      // nested sub-todo), the id-loss guard below refuses the write — deleting a
      // parent must not silently take managed children with it.
      lines.splice(idx, itemEndOf(lines, idx) - idx);
      const result = lines.join(eol);
      const after = managedIds(result);
      for (const id of managedIds(data)) {
        if (id !== removedId && !after.has(id)) {
          new Notice("MarkTodo: delete aborted (safety check). No changes made.");
          return data;
        }
      }
      ok = true;
      this.remember(file.path, result);
      return result;
    });
    return ok;
  }

  /** Stamp ids on every unmanaged todo in a file. Returns how many were adopted. */
  async adoptNote(file: TFile): Promise<number> {
    let count = 0;
    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      for (let i = 0; i < lines.length; i++) {
        const t = parseTodoLine(lines[i]);
        if (t && t.id === null) {
          lines[i] = serializeTodoLine({ ...t, id: generateId() });
          count++;
        }
      }
      const result = lines.join(eol);
      if (count > 0) this.remember(file.path, result);
      return result;
    });
    return count;
  }

  /**
   * Move a todo's entire line verbatim into another file.
   * Ordered INSERT-then-DELETE: we read the source line, write it into the
   * target first, then remove it from the source. If the target write fails the
   * source is untouched; if the source cleanup fails the todo is duplicated
   * (recoverable) rather than lost.
   */
  async moveTodo(todo: TodoRecord, targetPath: string): Promise<boolean> {
    const source = this.fileFor(todo);
    const target = this.app.vault.getAbstractFileByPath(targetPath);
    if (!source || !(target instanceof TFile) || source.path === targetPath) return false;

    // Read the current source line WITHOUT removing it yet.
    const { lines: srcLines } = splitEol(await this.app.vault.read(source));
    const srcIdx = findTodoLine(srcLines, todo);
    if (srcIdx === -1) return false;
    const cur = parseTodoLine(srcLines[srcIdx]);
    if (!cur) return false;
    const withId: Todo = cur.id ? cur : { ...cur, id: generateId() };
    const movedLine = serializeTodoLine(withId);
    // The todo's note and sub-items travel with it to the new note.
    const carried = srcLines.slice(srcIdx + 1, itemEndOf(srcLines, srcIdx));

    // 1. Insert into the TARGET first.
    if (!(await this.insertIntoTarget(target, movedLine, carried))) return false;

    // 2. Remove from the SOURCE (re-find against current bytes).
    await this.app.vault.process(source, (data) => {
      const { lines, eol } = splitEol(data);
      const idx = findTodoLine(lines, todo);
      if (idx === -1) return data; // already gone; target has it
      const before = managedIds(data);
      lines.splice(idx, itemEndOf(lines, idx) - idx);
      const result = lines.join(eol);
      const after = managedIds(result);
      for (const id of before) {
        if (id !== withId.id && !after.has(id)) {
          new Notice("MarkTodo: move left a duplicate (source cleanup skipped for safety).");
          return data;
        }
      }
      this.remember(source.path, result);
      return result;
    });
    return true;
  }

  /**
   * Move every DONE todo line to the bottom of a file. Intended
   * for flat notes; in project files DONE already lives under its `### Done`
   * section. Returns how many were moved.
   */
  async moveCompletedToBottom(file: TFile): Promise<number> {
    let moved = 0;
    await this.app.vault.process(file, (data) => {
      const { lines, eol } = splitEol(data);
      const done: string[] = [];
      const kept: string[] = [];
      for (const line of lines) {
        const t = parseTodoLine(line);
        if (t && statusOf(t) === "DONE") {
          done.push(line);
          moved++;
        } else {
          kept.push(line);
        }
      }
      if (moved === 0) return data;
      while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
      const result = [...kept, ...done].join(eol);
      this.remember(file.path, result);
      return result;
    });
    return moved;
  }
}
