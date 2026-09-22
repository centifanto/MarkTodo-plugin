/**
 * The todo editor's CREATE mode — capture is ONE dialog: title, destination,
 * status (projects only), priority, due. Every capture path that wants a dialog
 * funnels here: "Add todo…", the keyword popup's "Open todo editor…", and the
 * "+ Add" buttons on Kanban columns / List groups.
 *
 * Destinations: any project (preselected: the last one captured into), today's
 * daily note (when the Daily notes core plugin is on), and the catch-all note
 * (when set). The `captureDestination` setting picks project vs daily note as
 * the starting choice. Priority and due follow the title's tokens (`@ph`,
 * `due @ …`) until the user touches those controls.
 */
import { ButtonComponent, type Editor, Modal, Notice, TFile, setIcon } from "obsidian";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  STATUS_LABELS,
  statusesInPhase,
  type Priority,
  type Status,
  type TodoRecord,
} from "../core/types";
import { parseTodoLine } from "../core/parse";
import { serializeTodoLine } from "../core/serialize";
import { setStatus } from "../core/status";
import { localIsoStamp, syncDoneAt } from "../core/dates";
import { generateId } from "../core/id";
import { STATUS_ICONS, PRIORITY_ICONS } from "../ui/iconMaps";
import { getProjectFiles } from "./projects";
import { captureStatus, lineToTodo } from "./inlineLogic";
import { deleteEditorLine } from "./inlineTodo";
import { dailyNotesEnabled, ensureTodaysDailyNote } from "./dailyNote";
import type MarkTodoPlugin from "../../main";
import { THEME_CLASS } from "./themeStyles";
import { anchorBox, anchorModal, type ModalAnchor } from "./modalAnchor";
import { type Box } from "./modalAnchorLogic";

const PRIORITY_CHIPS: readonly Priority[] = ["URGENT", "HIGH", "LOW", "NONE"];
const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  LOW: "Low",
  NONE: "None",
};

const DAILY = "::daily::";
const CATCH_ALL = "::catchall::";

/** Called with the created todo (as a thin record) once it's written. */
export type OnCaptured = (todo: TodoRecord) => void;

export interface CaptureEditorOptions {
  /** Prefilled title (may carry `@priority` / `due @` tokens). */
  title?: string;
  /** Preselect this status (e.g. the Kanban column the "+" was clicked in). */
  status?: Status;
  /** Preselect this project note (vault path). */
  projectPath?: string;
  /**
   * What opened it — the "+" that was clicked, or the pointer. The dialog floats
   * over it instead of landing in the middle of the screen.
   */
  anchor?: ModalAnchor;
  onCaptured?: OnCaptured;
}

/** A note path's display name (basename without `.md`). */
function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

class CaptureModal extends Modal {
  private title: string;
  private destination = "";
  private status: Status;
  private priority: Priority;
  private priorityTouched = false;
  private due: string | null;
  private dueTouched = false;
  private submitted = false;
  private anchor: Box | null;
  private stopAnchoring: (() => void) | null = null;

  constructor(
    private plugin: MarkTodoPlugin,
    private opts: CaptureEditorOptions,
  ) {
    super(plugin.app);
    this.modalEl.addClass(THEME_CLASS);
    this.anchor = anchorBox(opts.anchor);
    this.title = opts.title ?? "";
    this.status = opts.status ?? plugin.settings.defaultStatus;
    const parsed = parseTodoLine(`- [ ] ${this.title}`);
    this.priority = parsed?.priority ?? "NONE";
    this.due = parsed?.due ?? null;
  }

  onOpen(): void {
    const { contentEl } = this;
    const { settings } = this.plugin;
    contentEl.addClass("marktodo-todo-modal");
    contentEl.createEl("h3", { cls: "marktodo-modal-title", text: "New todo" });

    const input = contentEl.createEl("input", {
      cls: "marktodo-quickadd-input",
      attr: { type: "text", placeholder: "What needs doing?  (@ph, due @ 2026-10-01 work too)" },
    });
    input.value = this.title;

    // Destinations: projects, today's daily note, the catch-all note.
    const projects = [...getProjectFiles(this.app)].sort((a, b) =>
      a.basename.localeCompare(b.basename),
    );
    const daily = dailyNotesEnabled(this.app);
    const catchAll = settings.catchAllPath.trim();
    const choices: Array<[string, string]> = projects.map((f) => [f.path, f.basename]);
    if (daily) choices.push([DAILY, "Today's daily note"]);
    if (catchAll) choices.push([CATCH_ALL, `${noteName(catchAll)} (catch-all)`]);
    this.destination = this.initialDestination(projects, daily, catchAll);

    const fields = contentEl.createDiv({ cls: "marktodo-fields" });
    const isProjectDest = (): boolean =>
      this.destination !== DAILY && this.destination !== CATCH_ALL && this.destination !== "";

    const destControl = this.field(fields, "Destination");
    let destSelect: HTMLSelectElement | null = null;
    if (choices.length === 0) {
      destControl.createDiv({
        cls: "marktodo-field-hint",
        text: "Create a project first (or turn on Daily notes / set a catch-all note).",
      });
    } else {
      destSelect = destControl.createEl("select", { cls: "dropdown", attr: { "aria-label": "Destination" } });
      for (const [value, label] of choices) destSelect.createEl("option", { value, text: label });
      destSelect.value = this.destination;
    }

    // Status only means something in a project note: a loose todo starts at
    // Backlog and can only ever be checked off (see `placement.ts`), so the row
    // goes away for the daily note and the catch-all rather than lying.
    const statusControl = this.field(fields, "Status");
    const statusRow = statusControl.parentElement as HTMLElement;
    this.statusChips(statusControl);
    statusRow.toggle(isProjectDest());
    if (destSelect) {
      const select = destSelect;
      select.onchange = (): void => {
        this.destination = select.value;
        statusRow.toggle(isProjectDest());
      };
    }

    const priorityControl = this.field(fields, "Priority");
    const syncPriority = this.chipRow(
      priorityControl.createDiv({ cls: "marktodo-chip-row mod-priority" }),
      PRIORITY_CHIPS,
      this.priority,
      (p) => {
        this.priority = p;
        this.priorityTouched = true;
      },
      (p) => [p === "NONE" ? null : PRIORITY_ICONS[p], PRIORITY_LABEL[p]],
    );

    const dueControl = this.field(fields, "Due");
    const dueInput = dueControl.createEl("input", { type: "date", value: this.due ?? "" });
    dueInput.onchange = (): void => {
      this.due = dueInput.value || null;
      this.dueTouched = true;
    };
    const clearDue = dueControl.createEl("button", {
      cls: "marktodo-field-clear clickable-icon",
      attr: { "aria-label": "Clear due date", title: "Clear due date" },
    });
    setIcon(clearDue, "x");
    clearDue.onclick = (): void => {
      dueInput.value = "";
      this.due = null;
      this.dueTouched = true;
    };

    // The title leads until a control is touched: typing `@pu` or a due token
    // updates the chips/date live.
    input.addEventListener("input", () => {
      this.title = input.value;
      const parsed = parseTodoLine(`- [ ] ${input.value}`);
      if (!this.priorityTouched) {
        this.priority = parsed?.priority ?? "NONE";
        syncPriority(this.priority);
      }
      if (!this.dueTouched) {
        this.due = parsed?.due ?? null;
        dueInput.value = this.due ?? "";
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      }
    });

    const actions = contentEl.createDiv({ cls: "marktodo-modal-actions" });
    new ButtonComponent(actions)
      .setButtonText("Add todo")
      .setCta()
      .onClick(() => void this.submit());

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    // Over the "+" that opened it — the title on the button, so the dialog grows
    // downward from where you were looking.
    this.stopAnchoring = anchorModal(this, this.anchor, ".marktodo-modal-title");
  }

  /** One label-and-control row of the field grid (the todo editor's shape). */
  private field(parent: HTMLElement, label: string): HTMLElement {
    const row = parent.createDiv({ cls: "marktodo-field" });
    row.createSpan({ cls: "marktodo-field-label", text: label });
    return row.createDiv({ cls: "marktodo-field-control" });
  }

  /** Status chips under their Plan / Active captions — the todo editor's shape. */
  private statusChips(control: HTMLElement): void {
    const all: HTMLElement[] = [];
    const values: Status[] = [];
    for (const phase of PHASE_ORDER) {
      const statuses = statusesInPhase(phase);
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
          all.forEach((c, i) => c.toggleClass("is-active", values[i] === st));
        };
        all.push(chip);
        values.push(st);
      }
    }
  }

  /** Preset project → daily note (if that's the setting) → last-used project → first choice. */
  private initialDestination(projects: TFile[], daily: boolean, catchAll: string): string {
    const { settings } = this.plugin;
    const has = (path: string): boolean => projects.some((f) => f.path === path);
    if (this.opts.projectPath && has(this.opts.projectPath)) return this.opts.projectPath;
    if (settings.captureDestination === "daily" && daily) return DAILY;
    if (settings.lastCaptureProject && has(settings.lastCaptureProject)) {
      return settings.lastCaptureProject;
    }
    if (projects.length > 0) return projects[0].path;
    if (daily) return DAILY;
    return catchAll ? CATCH_ALL : "";
  }

  /** A row of single-select chips; returns a setter that moves the highlight. */
  private chipRow<T extends string>(
    parent: HTMLElement,
    values: readonly T[],
    current: T,
    onPick: (value: T) => void,
    label: (value: T) => [icon: string | null, text: string],
  ): (value: T) => void {
    const wrap = parent.createDiv({ cls: "marktodo-chip-row" });
    const chips = values.map((v) => {
      const chip = wrap.createEl("button", { cls: "marktodo-chip" });
      const [icon, text] = label(v);
      if (icon) setIcon(chip.createSpan({ cls: "marktodo-chip-icon" }), icon);
      chip.createSpan({ text });
      chip.onclick = (): void => {
        onPick(v);
        highlight(v);
      };
      return chip;
    });
    const highlight = (value: T): void =>
      chips.forEach((c, i) => c.toggleClass("is-active", values[i] === value));
    highlight(current);
    return highlight;
  }

  /** The destination as a note (daily / catch-all created on demand). */
  private async resolveTarget(): Promise<TFile | null> {
    const { app, writer, settings } = this.plugin;
    if (this.destination === DAILY) {
      const note = await ensureTodaysDailyNote(app);
      if (!note) new Notice("MarkTodo: turn on the Daily notes core plugin to capture there.");
      return note;
    }
    if (this.destination === CATCH_ALL) return writer.ensureNote(settings.catchAllPath);
    const f = app.vault.getAbstractFileByPath(this.destination);
    return f instanceof TFile ? f : null;
  }

  private async submit(): Promise<void> {
    if (this.submitted) return;
    if (this.title.trim() === "") {
      new Notice("MarkTodo: give the todo a title.");
      return;
    }
    if (this.destination === "") {
      new Notice("MarkTodo: pick a destination — create a project first.");
      return;
    }
    this.submitted = true;
    this.close();

    const target = await this.resolveTarget();
    if (!target) return;
    const line = await this.plugin.writer.captureTodo({
      title: this.title,
      target,
      status: this.status,
      priority: this.priorityTouched ? this.priority : undefined,
      due: this.dueTouched ? this.due : undefined,
    });
    if (line === null) return;

    const isProject = this.plugin.fileKind(target) === "project";
    if (isProject && this.plugin.settings.lastCaptureProject !== target.path) {
      this.plugin.settings.lastCaptureProject = target.path;
      void this.plugin.saveSettings();
    }
    new Notice(`MarkTodo: added to ${target.basename}.`);
    const todo = parseTodoLine(line);
    if (todo && this.opts.onCaptured) {
      // Thin record: the Writer re-finds the line by id, so line 0 is fine.
      this.opts.onCaptured({
        ...todo,
        file: target.path,
        line: 0,
        project: isProject ? target.basename : null,
        subproject: null,
        section: null,
        note: "",
        projectGroup: null,
        archived: false,
      });
    }
  }

  onClose(): void {
    this.stopAnchoring?.();
    this.stopAnchoring = null;
    this.contentEl.empty();
  }
}

/** Open the todo editor in create mode. */
export function openCaptureEditor(plugin: MarkTodoPlugin, opts: CaptureEditorOptions = {}): void {
  new CaptureModal(plugin, opts).open();
}

/**
 * Send the cursor's line to another note (the catch-all note) — a
 * checkbox, list item or plain text becomes a managed todo there (status kept
 * if the target allows it). Insert-then-delete (the moveTodo ordering): the
 * target write lands first, and the editor line is only removed if it's still
 * byte-identical — worst case a recoverable duplicate, never a lost todo.
 */
export async function sendLineToNote(
  plugin: MarkTodoPlugin,
  editor: Editor,
  lineNo: number,
  target: TFile,
): Promise<TodoRecord | null> {
  const original = editor.getLine(lineNo);
  const converted = lineToTodo(original, original.length, original.length);
  if (!converted || converted.todo.displayText.trim() === "") {
    new Notice("MarkTodo: nothing to send — the line is empty.");
    return null;
  }
  const { todo, wasTodo } = converted;
  const placement = plugin.fileKind(target);
  const status = captureStatus(placement, todo, wasTodo, plugin.settings.defaultStatus);
  // Keep an existing id; the copy starts at the left margin.
  const line = serializeTodoLine(
    syncDoneAt(setStatus({ ...todo, id: todo.id ?? generateId(), indent: "" }, status), localIsoStamp(new Date())),
  );
  if (!(await plugin.writer.insertIntoTarget(target, line))) return null;

  if (editor.getLine(lineNo) === original) {
    deleteEditorLine(editor, lineNo);
    new Notice(`MarkTodo: sent to ${target.basename}.`);
  } else {
    new Notice(`MarkTodo: sent to ${target.basename} — the original line changed, so it was left in place.`);
  }
  const sent = parseTodoLine(line);
  return sent === null
    ? null
    : {
        ...sent,
        file: target.path,
        line: 0,
        project: placement === "project" ? target.basename : null,
        subproject: null,
        section: null,
        note: "",
        projectGroup: null,
        archived: false,
      };
}
