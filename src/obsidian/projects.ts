/**
 * Project-file helpers. A file is a "project" when its
 * frontmatter carries `marktodo` with a non-false value.
 */
import { type App, type TFile } from "obsidian";
import { isProjectFrontmatter, readNoteMeta, type NoteMeta } from "../core/noteMeta";

// The pure classifier lives in `core/noteMeta.ts` so the companion app
// can copy it instead of maintaining a hand-written mirror. Re-exported here so
// existing `./projects` importers keep working.
export { isProjectFrontmatter };

/** The note-level MarkTodo frontmatter (group / cleanup / archived) for a file. */
export function noteMetaOf(app: App, file: TFile): NoteMeta {
  return readNoteMeta(app.metadataCache.getFileCache(file)?.frontmatter);
}

/** The project note whose name (basename) is `name`, if any — filters store names. */
export function projectPathByName(app: App, name: string | undefined): string | undefined {
  if (!name) return undefined;
  return getProjectFiles(app).find((f) => f.basename === name)?.path;
}

/** A project note with its note-level frontmatter resolved. */
export interface ProjectEntry {
  file: TFile;
  /** Display name = the file basename. */
  name: string;
  /** `marktodo-group`, or null when ungrouped. */
  group: string | null;
  archived: boolean;
}

/**
 * Every project note with its group and archived flag, name-sorted. Archived
 * ones are EXCLUDED unless asked for — that is what archiving is for; callers
 * that offer a "Show archived" affordance pass `true`.
 */
export function projectEntries(app: App, includeArchived = false): ProjectEntry[] {
  return getProjectFiles(app)
    .map((file) => {
      const meta = noteMetaOf(app, file);
      return { file, name: file.basename, group: meta.group, archived: meta.archived };
    })
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Project entries bucketed by group, groups in name order and ungrouped last —
 * the shape a sectioned picker renders directly.
 */
export function projectsByGroup(
  entries: readonly ProjectEntry[],
): Map<string | null, ProjectEntry[]> {
  const named = new Map<string, ProjectEntry[]>();
  const ungrouped: ProjectEntry[] = [];
  for (const entry of entries) {
    if (entry.group === null) {
      ungrouped.push(entry);
      continue;
    }
    const bucket = named.get(entry.group);
    if (bucket) bucket.push(entry);
    else named.set(entry.group, [entry]);
  }
  const out = new Map<string | null, ProjectEntry[]>();
  for (const group of [...named.keys()].sort((a, b) => a.localeCompare(b))) {
    out.set(group, named.get(group)!);
  }
  if (ungrouped.length > 0) out.set(null, ungrouped);
  return out;
}

/** All markdown files in the vault that are MarkTodo projects. */
export function getProjectFiles(app: App): TFile[] {
  return app.vault
    .getMarkdownFiles()
    .filter((f) => isProjectFrontmatter(app.metadataCache.getFileCache(f)?.frontmatter));
}
