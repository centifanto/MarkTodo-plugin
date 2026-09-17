/**
 * Display-only title formatting (rendering is painted on top, never
 * persisted). The stored `displayText` keeps everything inline; for the
 * UI we drop the `due @ …` token (shown as a pill instead) and the priority
 * token (shown as an icon), unwrap `[[wikilink]]` brackets, and hide the
 * bookkeeping tokens — `done @` (the glyph already says done) and the
 * companion app's `notify @ … HH:MM` / `delete-after @ Nd`. PURE — never
 * touches storage.
 */
import { stripPriorityTokens } from "../core/priority";
import { DATE_SRC, TIME_SRC } from "../core/dates";

const DUE_RE = new RegExp(`\\s*due\\s*@\\s*${DATE_SRC}`);
const DONE_RE = new RegExp(`(^|\\s+)done\\s*@\\s*${DATE_SRC}`);
const NOTIFY_RE = new RegExp(`\\s*notify\\s*@\\s*${DATE_SRC}\\s+${TIME_SRC}`);
const DELETE_AFTER_RE = /\s*delete-after\s*@\s*\d+d/;
const LINK_RE = /\[\[([^\]]+)\]\]/g;

export function formatTitle(displayText: string): string {
  return stripPriorityTokens(displayText)
    .replace(DUE_RE, "")
    .replace(DONE_RE, "")
    .replace(NOTIFY_RE, "")
    .replace(DELETE_AFTER_RE, "")
    .replace(LINK_RE, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
