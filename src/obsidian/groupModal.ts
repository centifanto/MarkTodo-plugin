/**
 * Create, rename, re-member or delete a project group.
 *
 * A group has no registry — it is the set of notes carrying its name in
 * `marktodo-group` — so this modal edits exactly that: a name and a
 * checklist of projects. `groupEdits` turns the result into the minimal set of
 * frontmatter writes, and deleting a group only ever ungroups its projects.
 */
import { type App, Modal, Notice, Setting, TFile } from "obsidian";
import { GROUP_FM_KEY } from "../core/noteMeta";
import { groupEdits, type NavProject } from "../ui/projectNav";
import { confirmAction, markDestructive } from "./confirmModal";
import { THEME_CLASS } from "./themeStyles";

export interface GroupModalOptions {
  /** Every project (archived ones are listed last, muted). */
  projects: readonly NavProject[];
  /** The group being edited; null to create one. */
  group: string | null;
  /** A project to start ticked (New group… from a project's own menu). */
  startWith?: string;
  /** Called with the group's name afterwards (null when deleted) once every write has landed. */
  onDone: (from: string | null, to: string | null) => void;
}

const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export class GroupModal extends Modal {
  private name: string;
  private members: Set<string>;

  constructor(
    app: App,
    private opts: GroupModalOptions,
  ) {
    super(app);
    this.modalEl.addClass(THEME_CLASS);
    this.name = opts.group ?? "";
    this.members = new Set(opts.projects.filter((p) => opts.group !== null && p.group === opts.group).map((p) => p.path));
    if (opts.startWith !== undefined) this.members.add(opts.startWith);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(this.opts.group === null ? "New group" : "Edit group");
    contentEl.addClass("marktodo-group-modal");

    const input = contentEl.createEl("input", {
      cls: "marktodo-group-name",
      attr: { type: "text", placeholder: "Group name", "aria-label": "Group name" },
    });
    input.value = this.name;
    input.addEventListener("input", () => (this.name = input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.save();
      }
    });

    contentEl.createDiv({ cls: "marktodo-group-hint", text: "Projects in this group" });
    const list = contentEl.createDiv({ cls: "marktodo-group-members" });
    const sorted = [...this.opts.projects].sort(
      (a, b) => Number(a.archived) - Number(b.archived) || COLLATOR.compare(a.name, b.name),
    );
    for (const project of sorted) {
      const row = list.createEl("label", { cls: `marktodo-group-member${project.archived ? " is-muted" : ""}` });
      const box = row.createEl("input", { attr: { type: "checkbox" } });
      box.checked = this.members.has(project.path);
      box.addEventListener("change", () => {
        if (box.checked) this.members.add(project.path);
        else this.members.delete(project.path);
      });
      row.createSpan({ cls: "marktodo-group-member-name", text: project.name });
      // Where it is now, so moving a project out of another group is a choice you can see.
      const elsewhere = project.group !== null && project.group !== this.opts.group;
      if (elsewhere || project.archived) {
        row.createSpan({
          cls: "marktodo-group-member-note",
          text: [elsewhere ? `in ${project.group}` : "", project.archived ? "archived" : ""].filter(Boolean).join(" · "),
        });
      }
    }

    const buttons = new Setting(contentEl).setClass("marktodo-group-buttons");
    if (this.opts.group !== null) {
      buttons.addButton((b) =>
        markDestructive(b)
          .setButtonText("Delete group")
          .onClick(() => this.confirmDelete()),
      );
    }
    buttons
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(this.opts.group === null ? "Create group" : "Save")
          .setCta()
          .onClick(() => void this.save()),
      );

    window.setTimeout(() => input.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    const name = this.name.trim();
    if (name === "") {
      new Notice("MarkTodo: give the group a name.");
      return;
    }
    if (this.members.size === 0) {
      // A group is its members; an empty one would simply not exist.
      new Notice("MarkTodo: pick at least one project — a group with none disappears.");
      return;
    }
    this.close();
    await this.apply(name);
  }

  /** Ask, then ungroup every member. Usable without opening the editor first. */
  confirmDelete(): void {
    const group = this.opts.group;
    if (group === null) return;
    const count = this.opts.projects.filter((p) => p.group === group).length;
    confirmAction(this.app, {
      title: `Delete "${group}"?`,
      message: `Its ${count === 1 ? "project stays" : `${count} projects stay`} — ${count === 1 ? "it just isn't" : "they just aren't"} grouped any more.`,
      confirmText: "Delete group",
      onConfirm: () => {
        this.close();
        void this.apply(null);
      },
    });
  }

  private async apply(to: string | null): Promise<void> {
    const edits = groupEdits(this.opts.projects, this.opts.group, to, this.members);
    for (const edit of edits) {
      const file = this.app.vault.getAbstractFileByPath(edit.path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (edit.group === null) delete fm[GROUP_FM_KEY];
        else fm[GROUP_FM_KEY] = edit.group;
      });
    }
    this.opts.onDone(this.opts.group, to?.trim() ?? null);
  }
}
