/**
 * PURE archive-location logic. The Obsidian glue lives in
 * `archiveReconcile.ts`; the decisions live here so they are unit-tested
 * directly, the way `writeLogic` sits behind `writer`.
 *
 * `marktodo-archived: true` is CANONICAL; the archive folder is a materialized
 * view of it — as the glyph is canonical and the status heading is its
 * materialized view. The MarkTodo app only ever sets the flag; the plugin
 * relocates the note, because Obsidian owns the link index and rewrites every
 * `[[link]]` as part of the move.
 *
 * NOT a desktop round-trip: the plugin is `isDesktopOnly: false`, so this runs in
 * Obsidian on a phone too. Archive in the app, open Obsidian on the same device,
 * the note is filed and its links are correct.
 */
import { noteFolderPrefix } from "./projectScaffold";

/** The folder a note sits in ("" at the vault root). */
export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Where this note SHOULD live given its archived state, or null when it is
 * already right, the setting is off, or no archive folder is configured.
 */
export function archiveTarget(
  path: string,
  archived: boolean,
  archiveFolder: string,
  movesNote: boolean,
): string | null {
  if (!movesNote) return null;
  const folder = noteFolderPrefix(archiveFolder).replace(/\/$/, "");
  if (folder === "") return null;
  const parent = parentOf(path);
  const name = parent === "" ? path : path.slice(parent.length + 1);

  if (archived) {
    return parent === folder ? null : `${folder}/${name}`;
  }
  // Un-archived notes come OUT of the archive folder, to the vault root: where
  // they originally lived is recorded nowhere, and a predictable destination
  // beats an invented one.
  return parent === folder ? name : null;
}
