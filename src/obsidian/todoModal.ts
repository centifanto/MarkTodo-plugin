/**
 * Todo detail modal: opens when a todo title is clicked
 * in the list / board / Today. It surfaces the structured fields — status,
 * priority, due — in a fuller form than the quick status-icon Menu, plus
 * navigation ("Open note") and the convert / move actions.
 *
 * The title is editable: it shows the text minus the tokens the
 * other controls manage (core `editableTitle`) and saves through core
 * `setTitle`, which re-attaches priority/due/done tokens — links and tags stay
 * as typed. Every field routes through the audited `Writer` (Vault.process + the
 * abort-on-id-loss guard), so the modal can't bypass the write safety net.
 */
import { ButtonComponent, Modal, Platform, Setting, setIcon, type TFile, Notice} from "obsidian";
import { parseTodoLine } from "../core/parse";
import {
  STATUS_ORDER,
  statusOf,
  type Priority,
  type Status,
  type TodoRecord,
} from "../core/types";
import { STATUS_ICONS, PRIORITY_ICONS, PRIORITY_LABEL } from "../ui/iconMaps";
import { editableTitle } from "../core/title";
import { MoveToProjectModal } from "./moveModal";
import { confirmDeleteTodo, revealTodo } from "./todoMenu";
import { markDestructive } from "./confirmModal";
import { getProjectFiles } from "./projects";
import { canSetStatus, placementOf } from "./placement";
import type MarkTodoPlugin from "../../main";
import { THEME_CLASS } from "./themeStyles";
import { placeOverAnchor, type Box } from "./modalAnchorLogic";

const PRIORITY_CHIPS: readonly Priority[] = ["URGENT", "HIGH", "LOW", "NONE"];
/**
 * What the editor was opened from: the clicked row / card / icon, or a menu
 * click's pointer. Without one (a command, a hotkey) the dialog opens centred.
 */
export type TodoModalAnchor = Element | MouseEvent | KeyboardEvent | null | undefined;

/** Open the todo detail modal. Mirrors `openTodoMenu`'s shape so views call one helper. */
export function openTodoModal(plugin: MarkTodoPlugin, todo: TodoRecord, anchor?: TodoModalAnchor): void {
  new TodoModal(plugin, todo, anchorBox(anchor)).open();
}

/**
 * The anchor's on-screen box, read NOW — a write from the dialog can re-render
 * the list and detach the row, and the dialog shouldn't jump when it does. A
 * keyboard-activated menu item has no pointer, so it opens centred. Duck-typed,
 * not `instanceof`: a pop-out window's events and elements come from its own realm.
 */
function anchorBox(anchor: TodoModalAnchor): Box | null {
  if (!anchor) return null;
  if (!("getBoundingClientRect" in anchor)) {
    // No pointer: a keyboard event, or a synthetic / keyboard "click" (detail 0).
    if (!("clientX" in anchor) || anchor.detail === 0) return null;
    return { left: anchor.clientX, top: anchor.clientY, width: 0, height: 0 };
  }
  const { left, top, width, height } = anchor.getBoundingClientRect();
  return { left, top, width, height };
}

/**
 * Open the todo editor for a line in a note — the command,
 * the editor context menu, the inline edit icon, and the keyword popup all land
 * here. Uses the indexed record when the index already knows the todo (so
 * subproject/section are right), else a thin record built from the line text;
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
  const indexed = todo.id !== null ? plugin.index.getById(todo.id) : undefined;
  if (indexed && indexed.file === file.path) return { ...indexed, ...todo, line };
  return {
    ...todo,
    file: file.path,
    line,
    project: plugin.fileKind(file) === "project" ? file.basename : null,
    subproject: null,
    section: null,
    note: "",
    projectGroup: null,
    archived: false,
  };
}

class TodoModal extends Modal {
  // Optimistic local selection for the chips; the file write is the real source
  // of truth. The `todo` snapshot can go stale after a write, but the Writer
  // re-finds the line by id, so later edits in the same session still land.
  private status: Status;
  private priority: Priority;
  private stopAnchoring: (() => void) | null = null;

  constructor(
    private plugin: MarkTodoPlugin,
    private todo: TodoRecord,
    private anchor: Box | null = null,
  ) {
    super(plugin.app);
    this.modalEl.addClass(THEME_CLASS);
    this.status = statusOf(todo);
    this.priority = todo.priority;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("marktodo-todo-modal");

    this.buildTitle(contentEl);
    this.buildNote(contentEl);

    this.buildStatusRow(contentEl);
    this.buildPriorityRow(contentEl);
    this.buildDueRow(contentEl);
    this.buildLocationRow(contentEl);
    this.buildActions(contentEl);

    // Phones keep Obsidian's full-width sheet; there's no room to float it.
    if (this.anchor && !Platform.isPhone) this.anchorTo(this.anchor);
  }

  onClose(): void {
    this.stopAnchoring?.();
    this.stopAnchoring = null;
    this.contentEl.empty();
  }

  /**
   * Float the dialog over the row it was opened from, inside the window. Re-placed
   * whenever it changes size (the title field grows, a note is typed) or the
   * window does, so it never spills off screen.
   */
  private anchorTo(anchor: Box): void {
    const { modalEl, containerEl } = this;
    modalEl.addClass("marktodo-anchored");
    const title = modalEl.querySelector<HTMLElement>(".marktodo-modal-title");
    const place = (): void => {
      const alignY = title ? title.getBoundingClientRect().top - modalEl.getBoundingClientRect().top : 0;
      const { left, top } = placeOverAnchor(
        anchor,
        { width: modalEl.offsetWidth, height: modalEl.offsetHeight },
        { width: containerEl.clientWidth, height: containerEl.clientHeight },
        alignY,
      );
      modalEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(modalEl);
    const win = containerEl.win;
    win.addEventListener("resize", place);
    this.stopAnchoring = () => {
      observer.disconnect();
      win.removeEventListener("resize", place);
    };
  }

  private buildTitle(parent: HTMLElement): void {
    let saved = editableTitle(this.todo.displayText);
    const input = parent.createEl("textarea", {
      cls: "marktodo-modal-title",
      attr: { rows: "1", placeholder: "Todo title", "aria-label": "Todo title" },
    });
    input.value = saved;
    const fit = (): void => {
      input.setCssStyles({ height: "auto" });
      input.setCssStyles({ height: `${input.scrollHeight}px` });
    };
    const commit = (): void => {
      const next = input.value.replace(/\s+/g, " ").trim();
      if (next === "" ) {
        input.value = saved; // an empty title isn't allowed — put it back
        fit();
        return;
      }
      if (next === saved) return;
      saved = next;
      void this.plugin.writer.setTitle(this.todo, next);
    };
    input.addEventListener("input", fit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // one line only
        commit();
        input.blur();
      }
    });
    window.setTimeout(fit, 0);
  }

  /**
   * The todo's note block. A plain multi-line textarea saved on
   * blur — the same shape as the app's editor field, so both programs edit the
   * same bytes the same way.
   *
   * `Writer.setNote` no-ops on an unchanged note and REFUSES one whose lines
   * would become sub-todos or forge a capsule; the refusal is surfaced here
   * rather than letting the text vanish on the next re-render.
   */
  private buildNote(parent: HTMLElement): void {
    let saved = this.todo.note;
    const input = parent.createEl("textarea", {
      cls: "marktodo-modal-note",
      attr: { rows: "3", placeholder: "Add a note…", "aria-label": "Todo note" },
    });
    input.value = saved;
    input.addEventListener("blur", () => {
      const next = input.value.replace(/\s+$/, "");
      if (next === saved) return;
      void (async () => {
        const ok = await this.plugin.writer.setNote(this.todo, next);
        if (ok || next === "") {
          saved = next;
          return;
        }
        input.value = saved;
        new Notice("MarkTodo: note not saved — a line there would become a sub-todo.");
      })();
    });
  }

  private buildStatusRow(parent: HTMLElement): void {
    const { settings } = this.plugin;
    const placement = placementOf(this.todo);
    // Projects get every status; loose todos just check off.
    const statuses = STATUS_ORDER.filter((s) => canSetStatus(placement, s));
    const row = new Setting(parent).setName("Status");
    row.settingEl.addClass("marktodo-chip-setting");
    if (placement === "loose") {
      row.setDesc("Loose todo — move it to a project for more statuses.");
    }
    const wrap = row.controlEl.createDiv({ cls: "marktodo-chip-row mod-status" });
    for (const st of statuses) {
      const chip = wrap.createEl("button", { cls: "marktodo-chip" });
      setIcon(chip.createSpan({ cls: "marktodo-chip-icon" }), STATUS_ICONS[st]);
      chip.createSpan({ text: settings.statusLabels[st] });
      chip.toggleClass("is-active", st === this.status);
      chip.onclick = (): void => {
        this.status = st;
        wrap
          .findAll(".marktodo-chip")
          .forEach((c, i) => c.toggleClass("is-active", statuses[i] === st));
        void this.plugin.writer.setStatus(this.todo, st);
      };
    }
  }

  private buildPriorityRow(parent: HTMLElement): void {
    const row = new Setting(parent).setName("Priority");
    row.settingEl.addClass("marktodo-chip-setting");
    const wrap = row.controlEl.createDiv({ cls: "marktodo-chip-row mod-priority" });
    for (const p of PRIORITY_CHIPS) {
      const chip = wrap.createEl("button", { cls: "marktodo-chip" });
      if (p !== "NONE") setIcon(chip.createSpan({ cls: "marktodo-chip-icon" }), PRIORITY_ICONS[p]);
      chip.createSpan({ text: PRIORITY_LABEL[p] });
      chip.toggleClass("is-active", p === this.priority);
      chip.onclick = (): void => {
        this.priority = p;
        wrap
          .findAll(".marktodo-chip")
          .forEach((c, i) => c.toggleClass("is-active", PRIORITY_CHIPS[i] === p));
        void this.plugin.writer.setPriority(this.todo, p);
      };
    }
  }

  private buildDueRow(parent: HTMLElement): void {
    const row = new Setting(parent).setName("Due");
    row.settingEl.addClass("marktodo-inline-setting");
    const input = row.controlEl.createEl("input", {
      type: "date",
      value: this.todo.due ?? "",
    });
    input.onchange = (): void => {
      void this.plugin.writer.setDue(this.todo, input.value || null);
    };
    row.addExtraButton((b) =>
      b
        .setIcon("x")
        .setTooltip("Clear due date")
        .onClick(() => {
          input.value = "";
          void this.plugin.writer.setDue(this.todo, null);
        }),
    );
  }

  private buildLocationRow(parent: HTMLElement): void {
    const crumbs = [this.todo.project, this.todo.subproject].filter(Boolean).join(" · ");
    new Setting(parent)
      .setName("Location")
      .setDesc(`${crumbs ? crumbs + " — " : ""}${this.todo.file}:${this.todo.line + 1}`);
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
        .setIcon("badge-check")
        .setTooltip("Convert to MarkTodo — no id yet, so this todo isn't tracked")
        .onClick(() => {
          void this.plugin.writer.adopt(this.todo);
          this.close();
        });
    }

    const projects = getProjectFiles(this.plugin.app).filter(
      (f) => f.path !== this.todo.file,
    );
    if (projects.length > 0) {
      new ButtonComponent(bar)
        .setButtonText("Move…")
        .setIcon("folder-input")
        .setTooltip("Move to project")
        .onClick(() => {
          new MoveToProjectModal(this.plugin.app, projects, (file) => {
            void this.plugin.writer.moveTodo(this.todo, file.path);
          }).open();
          this.close();
        });
    }

    markDestructive(new ButtonComponent(bar))
      .setButtonText("Delete")
      .setIcon("trash-2")
      .setTooltip("Delete todo")
      .onClick(() => confirmDeleteTodo(this.plugin, this.todo, () => this.close()));
  }

  /** Open the source note and place the cursor on the todo's line. */
  private async openInNote(): Promise<void> {
    await revealTodo(this.plugin, this.todo);
    this.close();
  }
}
