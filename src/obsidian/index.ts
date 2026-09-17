/**
 * TodoIndex — the Obsidian glue around the pure `indexFileTodos`.
 *
 * Builds an in-memory `TodoRecord` index from the vault on load and keeps it
 * current via MetadataCache / Vault events. Reading is essentially free: Obsidian
 * has already parsed `listItems` (so we can skip files with no todos) and
 * `frontmatter` (for project detection); we only `cachedRead` files that contain
 * todos, and short-circuit via an FNV-1a content hash when nothing changed.
 *
 * Events are registered through `plugin.registerEvent` for automatic teardown;
 * change notifications are debounced; the content hash is the basis of the
 * writer's self-write guard.
 */

import { type App, Notice, TFile, debounce } from "obsidian";
import { type TodoRecord } from "../core/types";
import { filterTodos, type QueryScope } from "../core/query";
import { type MarkTodoSettings } from "./settings";
import { isProjectFrontmatter } from "./projects";
import { readNoteMeta } from "../core/noteMeta";
import { indexFileTodos, indexFormatKey, patchRecordsForRename } from "./indexLogic";
import { planSafeHeal } from "./writeLogic";
import { fnv1a } from "./hash";
import type MarkTodoPlugin from "../../main";

export interface IndexStats {
  files: number;
  todos: number;
  managed: number;
}

export class TodoIndex {
  private todosByFile = new Map<string, TodoRecord[]>();
  private hashByFile = new Map<string, string>();
  /** The `indexFormatKey` each file's records were derived under. */
  private formatByFile = new Map<string, string>();
  private byId = new Map<string, TodoRecord>();
  private subscribers = new Set<() => void>();
  /** Per-file read generation: a re-index that started later always wins. */
  private readGeneration = new Map<string, number>();
  private notify: () => void;
  private resolvedOnce = false;

  constructor(
    private plugin: MarkTodoPlugin,
    private getSettings: () => MarkTodoSettings,
  ) {
    this.notify = debounce(
      () => {
        // Snapshot: a subscriber may (un)subscribe synchronously during notify.
        for (const cb of [...this.subscribers]) cb();
      },
      50,
      true,
    );
  }

  private get app(): App {
    return this.plugin.app;
  }

  /** Register events and do the initial build. */
  async initialize(): Promise<void> {
    const { metadataCache, vault } = this.app;

    this.plugin.registerEvent(
      metadataCache.on("changed", (file) => {
        void this.reindexFile(file);
      }),
    );
    // 'resolved' fires once the initial cache is fully populated; rebuild then in
    // case some frontmatter/listItems weren't ready during the first pass.
    this.plugin.registerEvent(
      metadataCache.on("resolved", () => {
        if (!this.resolvedOnce) {
          this.resolvedOnce = true;
          void this.rebuildAll();
        }
      }),
    );
    this.plugin.registerEvent(
      vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.renameFile(oldPath, file);
        else this.removeFile(oldPath);
      }),
    );
    this.plugin.registerEvent(
      vault.on("delete", (file) => {
        this.removeFile(file.path);
        this.rebuildById();
        this.notify();
      }),
    );

    await this.rebuildAll();
  }

  /**
   * Full rebuild across all markdown files. Every file's records are derived
   * again, even when its text is unchanged: this runs after settings
   * change what the text MEANS and after the metadata cache first resolves
   * (frontmatter that wasn't ready decides project-ness), and a hash-skip made
   * both silent no-ops. Silent, so it never heals — the new records simply
   * become the baseline.
   */
  async rebuildAll(): Promise<void> {
    await Promise.all(
      this.app.vault.getMarkdownFiles().map((f) => this.reindexFile(f, true, true)),
    );
    this.rebuildById();
    this.notify();
  }

  private isExcluded(path: string): boolean {
    return this.getSettings().excludedFolders.some(
      (folder) =>
        folder.length > 0 &&
        (path === folder || path.startsWith(folder.replace(/\/?$/, "/"))),
    );
  }

  /**
   * Re-index a single file. `silent` suppresses byId rebuild + notify + heal (used
   * in bulk); `force` re-derives even when neither the text nor the format changed.
   */
  async reindexFile(file: TFile, silent = false, force = false): Promise<void> {
    if (file.extension !== "md" || this.isExcluded(file.path)) {
      this.dropAndMaybeNotify(file.path, silent);
      return;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const hasTodo = cache?.listItems?.some((li) => li.task !== undefined) ?? false;
    if (!hasTodo) {
      this.dropAndMaybeNotify(file.path, silent);
      return;
    }

    // The read is async, and two re-indexes of one file can overlap — e.g. the
    // one-time rebuild on `resolved` (which fires on the first change after the
    // plugin loads) racing the `changed` event for a note being written. Without
    // this, the OLDER read could land last and leave stale records whose hash
    // then matches nothing new, so they would never heal.
    const generation = (this.readGeneration.get(file.path) ?? 0) + 1;
    this.readGeneration.set(file.path, generation);
    const text = await this.app.vault.cachedRead(file);
    if (this.readGeneration.get(file.path) !== generation) return;
    const hash = fnv1a(text);
    const settings = this.getSettings();
    const format = indexFormatKey(settings.statusLabels, settings.statusLabelAliases);
    if (
      !force &&
      this.hashByFile.get(file.path) === hash &&
      this.formatByFile.get(file.path) === format &&
      this.todosByFile.has(file.path)
    ) {
      return; // unchanged since last index
    }

    const fm = cache?.frontmatter;
    const isProject = isProjectFrontmatter(fm);
    // Note-level frontmatter is read for EVERY note, project or not.
    const meta = readNoteMeta(fm);

    const records = indexFileTodos(file.path, text, {
      projectName: isProject ? file.basename : null,
      statusLabels: isProject ? settings.statusLabels : null,
      statusAliases: settings.statusLabelAliases,
      projectGroup: meta.group,
      archived: meta.archived,
    });

    const prior = this.todosByFile.get(file.path);
    const priorFormat = this.formatByFile.get(file.path);
    this.todosByFile.set(file.path, records);
    this.hashByFile.set(file.path, hash);
    this.formatByFile.set(file.path, format);

    if (!silent) {
      this.rebuildById();
      this.notify();
      if (isProject && prior) this.maybeHeal(file, hash, prior, priorFormat, records, format);
    }
  }

  /**
   * After an INCREMENTAL re-index of a project file, reconcile manual edits via
   * the heal rule. Skipped when this exact content was our OWN write (the writer
   * remembers it), so a heal can never trigger another heal. `planSafeHeal`
   * holds the other guards: no diff across a format change or a note that just
   * became a project, and a cap on statuses rewritten from headings.
   */
  private maybeHeal(
    file: TFile,
    hash: string,
    prior: TodoRecord[],
    priorFormat: string | undefined,
    next: TodoRecord[],
    format: string,
  ): void {
    const { writer } = this.plugin;
    if (!writer || writer.wasSelfWrite(file.path, hash)) return;
    const { ops, heldBack } = planSafeHeal(prior, next, priorFormat, format);
    if (heldBack > 0) {
      new Notice(
        `MarkTodo: ${heldBack} todos in "${file.basename}" now sit under a different status heading. ` +
          "That many at once looks like a heading change, not a move, so their statuses were left as they were.",
        10000,
      );
    }
    if (ops.length > 0) void writer.applyHeal(file, ops);
  }

  private dropAndMaybeNotify(path: string, silent: boolean): void {
    const had = this.todosByFile.has(path);
    this.removeFile(path);
    if (had && !silent) {
      this.rebuildById();
      this.notify();
    }
  }

  private removeFile(path: string): void {
    this.todosByFile.delete(path);
    this.hashByFile.delete(path);
    this.formatByFile.delete(path);
  }

  /**
   * Handle a vault rename. The records for the old path already exist and a pure
   * rename can't change their content, so we re-label them in place (new path +
   * new project basename) instead of re-reading the cache — which is eventually-
   * consistent and may still report the OLD basename at rename time.
   * That made a renamed project keep its stale name in the views until the next
   * edit. Falls back to a fresh index when the file wasn't tracked before (e.g.
   * moved out of an excluded folder), or drops it when moved out of scope.
   */
  private renameFile(oldPath: string, file: TFile): void {
    const records = this.todosByFile.get(oldPath);
    const hash = this.hashByFile.get(oldPath);
    const format = this.formatByFile.get(oldPath);
    this.removeFile(oldPath);

    const trackable = file.extension === "md" && !this.isExcluded(file.path);
    if (trackable && records) {
      this.todosByFile.set(
        file.path,
        patchRecordsForRename(records, file.path, file.basename),
      );
      if (hash !== undefined) this.hashByFile.set(file.path, hash);
      if (format !== undefined) this.formatByFile.set(file.path, format);
      this.rebuildById();
      this.notify();
    } else if (trackable) {
      void this.reindexFile(file); // was untracked (no todos / un-excluded by the move)
    } else {
      this.rebuildById(); // moved out of scope (non-md or into an excluded folder)
      this.notify();
    }
  }

  private rebuildById(): void {
    this.byId.clear();
    for (const recs of this.todosByFile.values()) {
      for (const r of recs) if (r.id) this.byId.set(r.id, r);
    }
  }

  // ── public accessors ─────────────────────────────────────────────────────

  getAll(): TodoRecord[] {
    const out: TodoRecord[] = [];
    for (const recs of this.todosByFile.values()) out.push(...recs);
    return out;
  }

  getByFile(path: string): TodoRecord[] {
    return this.todosByFile.get(path) ?? [];
  }

  getById(id: string): TodoRecord | undefined {
    return this.byId.get(id);
  }

  query(scope: QueryScope): TodoRecord[] {
    return filterTodos(this.getAll(), scope);
  }

  /** Content hash last indexed for a file (the writer's self-write guard reads this). */
  hashOf(path: string): string | undefined {
    return this.hashByFile.get(path);
  }

  stats(): IndexStats {
    const all = this.getAll();
    return {
      files: this.todosByFile.size,
      todos: all.length,
      managed: all.filter((t) => t.id !== null).length,
    };
  }

  /** Subscribe to (debounced) index changes; returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
