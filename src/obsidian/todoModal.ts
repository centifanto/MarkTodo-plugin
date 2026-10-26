/**
 * Todo detail modal: opens when a todo title is clicked
 * in the list / board / Today. It surfaces the structured fields — status,
 * priority, due, project — in a fuller form than the quick status-icon Menu,
 * plus navigation ("Open note") and the convert action.
 *
 * Layout: title, note, then one label-and-control grid. It draws its own rows
 * rather than Obsidian `Setting`s — a settings row is built for a settings tab
 * (tall, bordered, buttons stretched to full width on phones), and six of them
 * turned the editor into a form. The grid puts every label in one column so the
 * fields line up and the dialog stays the size of what it holds.
 *
 * Title and note are click-to-edit: they DISPLAY as text with working links
 * (`todoLinks.ts`) and swap to a textarea when you click the text. A todo's
 * words are ordinary markdown — `[[a note]]`, `[label](https://…)` and bare
 * URLs all mean what they mean everywhere else in Obsidian, and a dialog that
 * renders them as dead text is the wrong answer.
 *
 * The title saves through core `setTitle`, which re-attaches priority/due/done
 * tokens — links and tags stay as typed. Every field routes through the audited
 * `Writer` (Vault.process + the abort-on-id-loss guard), so the modal can't
 * bypass the write safety net.
 */
import { ButtonComponent, Modal, Notice, setIcon, TFile } from "obsidian";
import { indexFileTodos } from "./indexLogic";
import { findTodoLine } from "./writeLogic";
import { parseTodoLine } from "../core/parse";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  STATUS_LABELS,
  statusOf,
  statusesInPhase,
  type Priority,
  type Status,
  type TodoRecord,
} from "../core/types";
import { STATUS_ICONS, PRIORITY_ICONS, PRIORITY_LABEL, PROJECT_ICON } from "../ui/iconMaps";
import { editableTitle } from "../core/title";
import { confirmDeleteTodo, revealTodo } from "./todoMenu";
import { markDestructive } from "./confirmModal";
import { getProjectFiles } from "./projects";
import { canSetStatus, placementOf } from "./placement";
import { renderLinkedText } from "./todoLinks";
import type MarkTodoPlugin from "../../main";
import { THEME_CLASS } from "./themeStyles";
import { anchorBox, anchorModal, type ModalAnchor } from "./modalAnchor";
import { type Box } from "./modalAnchorLogic";

const PRIORITY_CHIPS: readonly Priority[] = ["URGENT", "HIGH", "LOW", "NONE"];

/** What the editor was opened from — see `modalAnchor`. */
export type TodoModalAnchor = ModalAnchor;

/** Open the todo detail modal. Mirrors `openTodoMenu`'s shape so views call one helper. */
export function openTodoModal(plugin: MarkTodoPlugin, todo: TodoRecord, anchor?: TodoModalAnchor): void {
  const box = anchorBox(anchor);
  void (async () => {
    const file = plugin.app.vault.getAbstractFileByPath(todo.file);
    if (!(file instanceof TFile)) return;
    const text = await plugin.app.vault.read(file);
    const records = indexFileTodos(file.path, text, { projectName: plugin.fileKind(file) === "project" ? file.basename : null });
    const idx = findTodoLine(text.split(/\r?\n/), todo);
    let current = records.find((r) => r.line === idx);
    if (!current) return;
    const focusLine = current.parentLine !== null ? current.line : null;
    while (current.parentLine !== null) {
      const parent = records.find((r) => r.line === current!.parentLine);
      if (!parent) return;
      current = parent;
    }
    new TodoModal(plugin, current, box, focusLine).open();
  })();
}

/**
 * Open the todo editor for a line in a note — the command,
 * the editor context menu, the inline edit icon, and the keyword popup all land
 * here. Uses the indexed record when the index already knows the todo (so
 * parent/section are right), else a thin record built from the line text;
 * the Writer re-finds the line by id either way. False when it isn't a todo line.
 */
export function openTodoModalForLine(
  plugin: MarkTodoPlugin,
  file: TFile,
  line: number,
  text: string,
  anchor?: TodoModalAnchor,
): boolean {
  const record = todoRecordForLine(plugin, file, line, text);
  if (!record) return false;
  openTodoModal(plugin, record, anchor);
  return true;
}

/** A TodoRecord for a note line: the indexed one when known, else built from the text. */
export function todoRecordForLine(
  plugin: MarkTodoPlugin,
  file: TFile,
  line: number,
  text: string,
): TodoRecord | null {
  const todo = parseTodoLine(text);
  if (!todo) return null;
  const indexed = todo.id !== null ? plugin.index.getById(todo.id) : plugin.index.getByFile(file.path).find((r) => r.line === line && r.displayText === todo.displayText);
  if (indexed && indexed.file === file.path) return { ...indexed, ...todo, line };
  return {
    ...todo,
    file: file.path,
    line,
    project: plugin.fileKind(file) === "project" ? file.basename : null,
    parentLine: null, depth: 0, parentText: null, steps: [],
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
  };
}

/** A note path's display name (basename without `.md`). */
function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

class TodoModal extends Modal {
  // Optimistic local selection for the chips; the file write is the real source
  // of truth. The `todo` snapshot can go stale after a write, but the Writer
  // re-finds the line by id, so later edits in the same session still land.
  private status: Status;
  private priority: Priority;
  private stepsVersion = 0;
  private refreshSteps: (() => Promise<void>) | null = null;
  private stopAnchoring: (() => void) | null = null;

  constructor(
    private plugin: MarkTodoPlugin,
    private todo: TodoRecord,
    private anchor: Box | null = null,
    private focusStep: number | null = null,
  ) {
    super(plugin.app);
    this.modalEl.addClass(THEME_CLASS);
    this.status = statusOf(todo);
    this.priority = todo.priority;
  }

  onOpen(): void {
    this.build();
    // The title field lands on the clicked row's title, not the dialog's top edge.
    this.stopAnchoring = anchorModal(this, this.anchor, ".marktodo-modal-title");
  }

  onClose(): void {
    this.stepsVersion++;
    this.stopAnchoring?.();
    this.stopAnchoring = null;
    this.contentEl.empty();
  }

  /**
   * Draw the whole dialog. Re-run after a MOVE: the todo's note changed, which
   * changes the location line, and a loose todo that lands in a project gains
   * every status — redrawing is both simpler and less wrong than patching rows.
   */
  private build(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("marktodo-todo-modal");

    this.buildTitle(contentEl);
    this.buildNote(contentEl);
    this.buildSteps(contentEl);

    const fields = contentEl.createDiv({ cls: "marktodo-fields" });
    this.buildStatusField(fields);
    this.buildPriorityField(fields);
    this.buildDueField(fields);
    this.buildProjectField(fields);

    this.buildLocation(contentEl);
    this.buildActions(contentEl);
  }

  /**
   * A click-to-edit block: the text as text (links live), swapping to a textarea
   * when you click it and back when you leave. One helper for the title and the
   * note — they differ only in how many lines they take and what saves them.
   */
  private editable(opts: {
    parent: HTMLElement;
    cls: string;
    value: string;
    placeholder: string;
    label: string;
    /** Enter commits instead of inserting a newline (the title is one line). */
    singleLine: boolean;
    /** Save; false means the write was refused and the field should snap back. */
    commit: (next: string) => Promise<boolean> | boolean;
  }): void {
    const { parent, cls, placeholder, label, singleLine, commit } = opts;
    let saved = opts.value;
    const wrap = parent.createDiv({ cls: `marktodo-editable ${cls}` });

    const paint = (): void => {
      wrap.empty();
      const view = wrap.createDiv({
        cls: "marktodo-editable-view",
        attr: { role: "button", tabindex: "0", "aria-label": `${label} — click to edit` },
      });
      if (saved.trim() === "") view.createSpan({ cls: "marktodo-editable-empty", text: placeholder });
      else renderLinkedText(view, saved, this.plugin, this.todo.file, () => this.close());
      view.addEventListener("click", () => edit());
      view.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          edit();
        }
      });
    };

    const edit = (): void => {
      wrap.empty();
      const input = wrap.createEl("textarea", {
        cls: "marktodo-editable-input",
        attr: { rows: singleLine ? "1" : "3", placeholder, "aria-label": label },
      });
      input.value = saved;
      const fit = (): void => {
        input.setCssStyles({ height: "auto" });
        input.setCssStyles({ height: `${input.scrollHeight}px` });
      };
      const done = (): void => {
        const next = singleLine ? input.value.replace(/\s+/g, " ").trim() : input.value.replace(/\s+$/, "");
        if (next === saved) {
          paint();
          return;
        }
        void (async () => {
          const ok = await commit(next);
          if (ok) saved = next;
          paint();
        })();
      };
      input.addEventListener("input", fit);
      input.addEventListener("blur", done);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          input.value = saved; // blur below commits the unchanged value: a no-op
          input.blur();
          return;
        }
        if (singleLine && e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
      fit();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      // A textarea's scrollHeight is only right once it has been laid out.
      window.setTimeout(fit, 0);
    };

    paint();
  }

  private buildTitle(parent: HTMLElement): void {
    this.editable({
      parent,
      cls: "marktodo-modal-title",
      value: editableTitle(this.todo.displayText),
      placeholder: "Todo title",
      label: "Todo title",
      singleLine: true,
      commit: async (next) => {
        if (next === "") return false; // an empty title isn't allowed — put it back
        return this.saveField(() => this.plugin.writer.setTitle(this.todo, next));
      },
    });
  }

  /**
   * The todo's note block — the same bytes the app's editor field edits.
   *
   * `Writer.setNote` no-ops on an unchanged note and REFUSES one whose lines
   * would become steps or forge a capsule; the refusal is surfaced here
   * rather than letting the text vanish on the next re-render.
   */
  private buildNote(parent: HTMLElement): void {
    this.editable({
      parent,
      cls: "marktodo-modal-note",
      value: this.todo.note,
      placeholder: "Add a note…",
      label: "Todo note",
      singleLine: false,
      commit: async (next) => {
        const ok = await this.plugin.writer.setNote(this.todo, next);
        // Clearing a note is always allowed; a refusal only happens on content.
        if (!ok && next !== "") {
          new Notice("MarkTodo: note not saved — a line there would become a step.");
        }
        return ok || next === "";
      },
    });
  }

  /** Follow adoption and section moves so later step edits use the current parent. */
  private async saveField(save: () => Promise<boolean>): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.todo.file);
    if (!(file instanceof TFile)) return false;
    const oldId = this.todo.id;
    const priorIds = oldId === null
      ? new Set(indexFileTodos(file.path, await this.plugin.app.vault.read(file), { projectName: this.todo.project }).map((r) => r.id))
      : null;
    const ok = await save();
    if (!ok) return false;
    const records = indexFileTodos(file.path, await this.plugin.app.vault.read(file), { projectName: this.todo.project });
    const candidates = records.filter((r) => r.parentLine === null &&
      (oldId !== null ? r.id === oldId : r.id !== null && !priorIds!.has(r.id)));
    if (candidates.length === 1) this.todo = candidates[0];
    await this.refreshSteps?.();
    return true;
  }

  /** Plain checkbox steps: no scheduling fields and no separate todo editor. */
  private buildSteps(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: "marktodo-steps" });
    const version = ++this.stepsVersion;
    const refresh = async (): Promise<void> => {
      const file = this.plugin.app.vault.getAbstractFileByPath(this.todo.file);
      if (!(file instanceof TFile)) return;
      const text = await this.plugin.app.vault.read(file);
      if (version !== this.stepsVersion) return;
      const idx = findTodoLine(text.split(/\r?\n/), this.todo);
      const current = indexFileTodos(file.path, text, { projectName: this.todo.project }).find((r) => r.line === idx);
      if (!current) return;
      this.todo = current;
      wrap.empty();
      wrap.createDiv({ cls: "marktodo-steps-heading", text: "Steps" });
      if (current.steps.length > 0) {
        wrap.createDiv({ cls: "marktodo-step-progress", text: `${current.steps.filter((s) => s.done).length} of ${current.steps.length} steps done` });
      }
      for (const step of current.steps) {
        const row = wrap.createDiv({ cls: "marktodo-steps-row" });
        const checkbox = row.createEl("input", { type: "checkbox", attr: { "aria-label": `Complete step: ${step.text}` } });
        checkbox.checked = step.done;
        let saving = false;
        const save = async (edit: { done: boolean } | { text: string } | { delete: true }): Promise<void> => {
          if (saving) return;
          saving = true;
          checkbox.disabled = true;
          const ok = await this.plugin.writer.editStep(current, step, edit);
          if (!ok) new Notice("MarkTodo: the step changed. Please try again.");
          await refresh();
        };
        checkbox.onchange = (): void => { void save({ done: checkbox.checked }); };
        const title = row.createEl("input", { type: "text", value: step.text, attr: { "aria-label": "Step text" } });
        title.toggleClass("is-done", step.done);
        title.onchange = (): void => { void save({ text: title.value }); };
        const remove = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `Remove step: ${step.text}`, title: "Remove step" } });
        setIcon(remove, "x");
        remove.onclick = (): void => { void save({ delete: true }); };
        if (step.line === this.focusStep) {
          this.focusStep = null;
          title.focus();
          row.scrollIntoView({ block: "nearest" });
        }
      }
      const addRow = wrap.createDiv({ cls: "marktodo-steps-add" });
      const input = addRow.createEl("input", { type: "text", attr: { placeholder: "Add step", "aria-label": "Add step" } });
      const button = addRow.createEl("button", { text: "Add step" });
      const add = async (): Promise<void> => {
        if (!input.value.trim() || button.disabled) return;
        button.disabled = true;
        const ok = await this.plugin.writer.addStep(current, input.value);
        if (!ok) { new Notice("MarkTodo: give the step a single-line title."); button.disabled = false; return; }
        await refresh();
        wrap.querySelector<HTMLInputElement>(".marktodo-steps-add input")?.focus();
      };
      button.onclick = (): void => { void add(); };
      input.onkeydown = (e): void => { if (e.key === "Enter") { e.preventDefault(); void add(); } };
    };
    this.refreshSteps = refresh;
    void refresh();
  }

  /** One label-and-control row of the grid. */
  private field(parent: HTMLElement, label: string): HTMLElement {
    const row = parent.createDiv({ cls: "marktodo-field" });
    row.createSpan({ cls: "marktodo-field-label", text: label });
    return row.createDiv({ cls: "marktodo-field-control" });
  }

  /**
   * Status, in its two phases. The chips are grouped under a Plan / Active
   * caption rather than run together: which half of the board a status belongs
   * to is the first thing you decide, and it is the same split the lists and
   * the focus row use.
   */
  private buildStatusField(parent: HTMLElement): void {
    const placement = placementOf(this.todo);
    const control = this.field(parent, "Status");
    const chips: Array<[Status, HTMLElement]> = [];

    for (const phase of PHASE_ORDER) {
      // Projects get every status; loose todos just check off.
      const statuses = statusesInPhase(phase).filter((s) => canSetStatus(placement, s));
      if (statuses.length === 0) continue;
      const group = control.createDiv({ cls: "marktodo-chip-group" });
      group.createSpan({ cls: "marktodo-chip-phase", text: PHASE_LABELS[phase] });
      const row = group.createDiv({ cls: "marktodo-chip-row mod-status" });
      for (const st of statuses) {
        const chip = row.createEl("button", { cls: "marktodo-chip" });
        setIcon(chip.createSpan({ cls: "marktodo-chip-icon" }), STATUS_ICONS[st]);
        chip.createSpan({ text: STATUS_LABELS[st] });
        chip.toggleClass("is-active", st === this.status);
        chip.onclick = (): void => {
          this.status = st;
          for (const [value, el] of chips) el.toggleClass("is-active", value === st);
          void this.saveField(() => this.plugin.writer.setStatus(this.todo, st));
        };
        chips.push([st, chip]);
      }
    }

    if (placement === "loose") {
      control.createDiv({
        cls: "marktodo-field-hint",
        text: "Loose todo — give it a project below for the other statuses.",
      });
    }
  }

  private buildPriorityField(parent: HTMLElement): void {
    const control = this.field(parent, "Priority");
    const row = control.createDiv({ cls: "marktodo-chip-row mod-priority" });
    for (const p of PRIORITY_CHIPS) {
      const chip = row.createEl("button", { cls: "marktodo-chip" });
      if (p !== "NONE") setIcon(chip.createSpan({ cls: "marktodo-chip-icon" }), PRIORITY_ICONS[p]);
      chip.createSpan({ text: PRIORITY_LABEL[p] });
      chip.toggleClass("is-active", p === this.priority);
      chip.onclick = (): void => {
        this.priority = p;
        row.findAll(".marktodo-chip").forEach((c, i) => c.toggleClass("is-active", PRIORITY_CHIPS[i] === p));
        void this.saveField(() => this.plugin.writer.setPriority(this.todo, p));
      };
    }
  }

  private buildDueField(parent: HTMLElement): void {
    const control = this.field(parent, "Due");
    const input = control.createEl("input", { type: "date", value: this.todo.due ?? "" });
    const clear = control.createEl("button", {
      cls: "marktodo-field-clear clickable-icon",
      attr: { "aria-label": "Clear due date", title: "Clear due date" },
    });
    setIcon(clear, "x");
    // Nothing to clear when the todo has no due date — see `quickAdd`.
    const syncClear = (): void => clear.toggle(input.value !== "");
    syncClear();
    input.onchange = (): void => {
      void this.saveField(() => this.plugin.writer.setDue(this.todo, input.value || null));
      syncClear();
    };
    clear.onclick = (): void => {
      input.value = "";
      void this.saveField(() => this.plugin.writer.setDue(this.todo, null));
      syncClear();
    };
  }

  /**
   * The project, as a DROPDOWN — the todo's project is a field like any other,
   * not an action behind a picker window. Picking a different one moves the
   * todo's line (and its note, and its sub-items) into that note.
   */
  private buildProjectField(parent: HTMLElement): void {
    const control = this.field(parent, "Project");
    const current = this.todo.file;
    const projects = getProjectFiles(this.plugin.app).sort((a, b) => a.basename.localeCompare(b.basename));

    const select = control.createEl("select", { cls: "dropdown", attr: { "aria-label": "Project" } });
    // A loose todo's own note is not a project, so it needs an option of its
    // own — otherwise the dropdown would show some other note's name as if the
    // todo already lived there.
    if (!projects.some((f) => f.path === current)) {
      select.createEl("option", { value: current, text: `${noteName(current)} (not a project)` });
    }
    for (const file of projects) select.createEl("option", { value: file.path, text: file.basename });
    select.value = current;

    select.onchange = (): void => {
      const target = select.value;
      if (target === current) return;
      select.disabled = true;
      void (async () => {
        const moved = await this.plugin.writer.moveTodo(this.todo, target);
        if (!moved) {
          select.value = current;
          select.disabled = false;
          new Notice("MarkTodo: the todo could not be moved.");
          return;
        }
        // The snapshot the rest of the dialog writes through has to follow it.
        this.todo = {
          ...this.todo,
          file: target,
          project: noteName(target),
          parentLine: null, depth: 0, parentText: null, steps: [],
          section: null,
        };
        new Notice(`MarkTodo: moved to "${noteName(target)}".`);
        this.build();
      })();
    };
  }

  /** Where the todo lives, in words — the note and line. */
  private buildLocation(parent: HTMLElement): void {
    const line = parent.createDiv({ cls: "marktodo-modal-location" });
    setIcon(line.createSpan({ cls: "marktodo-meta-icon" }), PROJECT_ICON);
    line.createSpan({ text: `${this.todo.file}:${this.todo.line + 1}` });
  }

  /**
   * One compact footer row of actions instead of a settings row per action — on
   * phones Obsidian stretches every settings-row button to full width.
   */
  private buildActions(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "marktodo-modal-actions" });

    new ButtonComponent(bar)
      .setButtonText("Open note")
      .setCta()
      .onClick(() => void this.openInNote());

    if (this.todo.id === null) {
      new ButtonComponent(bar)
        .setButtonText("Convert")
        .setTooltip("Convert to MarkTodo — no ID yet, so this todo isn't tracked")
        .onClick(() => {
          void this.plugin.writer.adopt(this.todo);
          this.close();
        });
    }

    markDestructive(new ButtonComponent(bar))
      .setButtonText("Delete")
      .setTooltip("Delete todo")
      .onClick(() => confirmDeleteTodo(this.plugin, this.todo, () => this.close()));
  }

  /** Open the source note and place the cursor on the todo's line. */
  private async openInNote(): Promise<void> {
    await revealTodo(this.plugin, this.todo);
    this.close();
  }
}
