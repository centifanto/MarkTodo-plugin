/**
 * "Create project…". Projects exist only by
 * deliberate creation — this is the front door. Prompts for a name, writes the
 * full scaffold (frontmatter + status headings via `projectNoteContent`), and
 * opens the note. The old "Convert note to project" stays minimal by design:
 * headers appear on demand through `placeTodoInProject`.
 */
import { type App, Modal, Notice, Setting, normalizePath } from "obsidian";
import { noteFolderPrefix, projectNoteContent, safeProjectBasename } from "./projectScaffold";
import { showInDashboard } from "./layout";
import type MarkTodoPlugin from "../../main";
import { THEME_CLASS } from "./themeStyles";
import { anchorBox, anchorModal, type ModalAnchor } from "./modalAnchor";
import { type Box } from "./modalAnchorLogic";

class ProjectNameModal extends Modal {
  private value = "";
  private anchor: Box | null;
  private stopAnchoring: (() => void) | null = null;

  constructor(
    app: App,
    anchor: ModalAnchor,
    private onSubmit: (name: string) => void,
  ) {
    super(app);
    this.modalEl.addClass(THEME_CLASS);
    this.anchor = anchorBox(anchor);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("marktodo-project-modal");
    contentEl.createEl("h3", { cls: "marktodo-modal-title", text: "Create project" });

    const input = contentEl.createEl("input", {
      attr: { type: "text", placeholder: "Project name" },
      cls: "marktodo-project-name-input",
    });
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Create")
        .setCta()
        .onClick(() => this.submit()),
    );
    input.focus();
    this.stopAnchoring = anchorModal(this, this.anchor, ".marktodo-modal-title");
  }

  private submit(): void {
    const name = this.value.trim();
    if (!name) {
      new Notice("MarkTodo: give the project a name.");
      return;
    }
    this.close();
    this.onSubmit(name);
  }

  onClose(): void {
    this.stopAnchoring?.();
    this.stopAnchoring = null;
    this.contentEl.empty();
  }
}

export function createProject(plugin: MarkTodoPlugin, anchor?: ModalAnchor): void {
  new ProjectNameModal(plugin.app, anchor, (name) => {
    void (async () => {
      const { settings, app } = plugin;
      const base = safeProjectBasename(name);
      // The configured projects folder, falling back to
      // Obsidian's own new-file location when it is left empty.
      const configured = noteFolderPrefix(settings.projectsFolder);
      const fallback = app.fileManager.getNewFileParent("").path;
      const prefix =
        configured !== ""
          ? configured
          : fallback === "/" || fallback === ""
            ? ""
            : `${fallback}/`;
      let path = normalizePath(`${prefix}${base}.md`);
      let i = 2;
      while (app.vault.getAbstractFileByPath(path) !== null) {
        path = normalizePath(`${prefix}${base} ${i++}.md`);
      }
      if (prefix !== "") {
        // vault.create does not make parents.
        const dir = prefix.replace(/\/$/, "");
        if (app.vault.getAbstractFileByPath(dir) === null) {
          await app.vault.createFolder(dir).catch(() => {});
        }
      }
      const file = await app.vault.create(path, projectNoteContent());
      // Straight into the new project's view — its empty status
      // sections, each with a "+", are the quickest way to start filling it.
      // Lightweight mode has no dashboard: the note itself.
      if (plugin.lightweight) await app.workspace.getLeaf(false).openFile(file);
      else await showInDashboard(plugin, { kind: "project", path: file.path });
      new Notice(`MarkTodo: project "${file.basename}" created.`);
    })();
  }).open();
}
