/**
 * One MarkTodo folder. PURE.
 *
 * Created when the plugin is installed; changing it moves the contents. It is
 * one root with fixed children — `<root>/Projects` for new projects,
 * `<root>/Archive` for archived ones — so moving MarkTodo is moving one
 * folder. `projectsFolder` / `archiveFolder` stay in data.json, derived
 * from the root, because the app reads them.
 *
 * Placement only: projects are FOUND by frontmatter anywhere in the
 * vault, so a folder change never strands one.
 */

export const DEFAULT_MARKTODO_FOLDER = "MarkTodo";
export const PROJECTS_SUBFOLDER = "Projects";
export const ARCHIVE_SUBFOLDER = "Archive";

/** A typed folder → a vault path: trimmed, no leading/trailing or doubled slashes; blank = the default. */
export function normalizeFolderRoot(value: string): string {
  const path = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return path === "" ? DEFAULT_MARKTODO_FOLDER : path;
}

/** The two placement folders every program reads, from the root. */
export function derivedFolders(root: string): { projectsFolder: string; archiveFolder: string } {
  return { projectsFolder: `${root}/${PROJECTS_SUBFOLDER}`, archiveFolder: `${root}/${ARCHIVE_SUBFOLDER}` };
}

/**
 * The root the earlier two-folder setting implies: `X/Projects` + `X/Archive` → `X`.
 * Anything else (either at the vault root, or unrelated paths) → the default;
 * notes stay where they are, which is safe because discovery is by frontmatter.
 */
export function rootFromLegacy(projectsFolder: unknown, archiveFolder: unknown): string {
  if (typeof projectsFolder !== "string" || typeof archiveFolder !== "string") return DEFAULT_MARKTODO_FOLDER;
  const p = projectsFolder.trim().replace(/^\/+|\/+$/g, "");
  const a = archiveFolder.trim().replace(/^\/+|\/+$/g, "");
  const suffix = `/${PROJECTS_SUBFOLDER}`;
  if (!p.endsWith(suffix)) return DEFAULT_MARKTODO_FOLDER;
  const root = p.slice(0, -suffix.length);
  return root !== "" && a === `${root}/${ARCHIVE_SUBFOLDER}` ? root : DEFAULT_MARKTODO_FOLDER;
}

/**
 * Whether to create `<root>/Projects` on load: only on a first install (no
 * data.json), in a vault with no MarkTodo projects yet, when it isn't there. A
 * reinstall, or a synced device whose data.json hasn't arrived, finds projects
 * and so never scatters a default folder beside the user's own.
 */
export function shouldCreateFolderOnInstall(
  firstInstall: boolean,
  projectCount: number,
  folderExists: boolean,
): boolean {
  return firstInstall && projectCount === 0 && !folderExists;
}

export type FolderMove =
  /** The old folder doesn't exist: nothing to move, just use the new one. */
  | "nothing"
  /** The new path is free: one folder rename (Obsidian rewrites every link). */
  | "rename"
  /** Something already lives at the new path: move project notes one by one. */
  | "per-file"
  /** One is inside the other (or they're the same folder): no move is possible. */
  | "nested";

function isWithin(path: string, folder: string): boolean {
  return path.toLowerCase() === folder.toLowerCase() || path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
}

/** How changing the root from `oldRoot` to `newRoot` would move what's inside. */
export function planFolderMove(
  oldRoot: string,
  newRoot: string,
  oldExists: boolean,
  newExists: boolean,
): FolderMove {
  if (!oldExists) return "nothing";
  if (isWithin(newRoot, oldRoot) || isWithin(oldRoot, newRoot)) return "nested";
  return newExists ? "per-file" : "rename";
}

/**
 * The per-file moves when the new root already exists: every project note under
 * the old root, keeping its path relative to the root (`MarkTodo/Projects/A.md` →
 * `Work/MarkTodo/Projects/A.md`). Other files stay put — they aren't MarkTodo's
 * to move into somebody's existing folder.
 */
export function perFileMoves(
  oldRoot: string,
  newRoot: string,
  projectPaths: readonly string[],
): Array<{ from: string; to: string }> {
  const prefix = `${oldRoot}/`;
  return projectPaths
    .filter((path) => path.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((path) => ({ from: path, to: `${newRoot}/${path.slice(prefix.length)}` }));
}

/** The folder a path sits in ("" at the vault root). */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
