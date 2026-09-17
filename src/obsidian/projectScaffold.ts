/**
 * PURE project-note scaffold. "Create project"
 * writes the full opinionated skeleton — frontmatter + every status heading in
 * column order — so a fresh project mirrors its board from the first open.
 * Status headings at `##` (the convention when there are no subprojects).
 * No Obsidian imports — unit-tested directly.
 */
import { PROJECT_FM_KEY } from "../core/noteMeta";
import { type Status } from "../core/types";

export function projectNoteContent(
  statusLabels: Record<Status, string>,
  statusOrder: readonly Status[],
): string {
  const headings = statusOrder.map((s) => `## ${statusLabels[s]}`).join("\n\n");
  return `---\n${PROJECT_FM_KEY}: true\n---\n\n${headings}\n`;
}

/** Strip characters Obsidian forbids in filenames; fall back when nothing survives. */
export function safeProjectBasename(name: string, fallback = "New Project"): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim() || fallback;
}

/**
 * Where a new note of this kind goes. PURE so both programs
 * agree. `folder` is a configured default location; empty (or "/") means the
 * vault root, which is today's behavior and stays available.
 *
 * This decides placement only — discovery is still frontmatter-based, so moving
 * the setting never strands an existing project.
 */
export function noteFolderPrefix(folder: string): string {
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "" : `${trimmed}/`;
}
