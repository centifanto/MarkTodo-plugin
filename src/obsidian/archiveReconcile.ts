/**
 * Obsidian glue for archive-location reconciliation. The decisions
 * are in the pure `archiveLogic.ts`; this walks the vault and does the IO.
 *
 * `fileManager.renameFile` is what makes the move cheap and safe: Obsidian
 * rewrites every `[[link]]` to the note across the vault as part of it. Runs
 * wherever the plugin runs — Obsidian mobile included — so archiving on the phone
 * never waits on a computer.
 */
import { Notice, TFile, normalizePath, type App } from "obsidian";
import { type MarkTodoSettings } from "./settings";
import { archiveTarget, parentOf } from "./archiveLogic";
import { readNoteMeta } from "../core/noteMeta";
import { isProjectFrontmatter } from "./projects";

/**
 * Move every project note whose location disagrees with its archived flag.
 * Resolves to how many moved. Failures are counted, reported once, and skipped:
 * a name collision in the archive folder must not abort the rest.
 */
export async function reconcileArchive(
  app: App,
  settings: Pick<MarkTodoSettings, "archiveFolder" | "archiveMovesNote">,
): Promise<number> {
  if (!settings.archiveMovesNote) return 0;

  let moved = 0;
  let failed = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!isProjectFrontmatter(fm)) continue;

    const target = archiveTarget(
      file.path,
      readNoteMeta(fm).archived,
      settings.archiveFolder,
      true,
    );
    if (target === null) continue;

    const dir = parentOf(target);
    if (dir !== "" && app.vault.getAbstractFileByPath(dir) === null) {
      await app.vault.createFolder(dir).catch(() => {});
    }
    if (app.vault.getAbstractFileByPath(normalizePath(target)) instanceof TFile) {
      failed++;
      continue; // something already lives there — leave both alone
    }
    try {
      await app.fileManager.renameFile(file, normalizePath(target));
      moved++;
    } catch {
      failed++;
    }
  }
  if (failed > 0) {
    new Notice(
      `MarkTodo: ${failed} archived note${failed === 1 ? "" : "s"} could not be moved (name already taken).`,
    );
  }
  return moved;
}
