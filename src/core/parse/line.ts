/**
 * Parse a single Markdown line into a `Todo` using the in-place model:
 * extract ONLY the trailing capsule; leave links/tags/dates/
 * priority tokens exactly where the user typed them in `displayText`. The
 * `due`/`tags`/`links`/`priority` fields are *recognized by scanning* for
 * indexing/filtering — they are NOT removed from `displayText`, which is what
 * keeps serialization identity-preserving.
 */

import { type Todo } from "../types";
import { priorityFromText } from "../priority";
import { DATE_SRC, canonicalDate } from "../dates";
import { extractCapsule } from "./capsule";

/** A todo list item: optional indent, a `-`/`*`/`+` bullet, a single-char checkbox. */
const TODO_RE = /^(\s*)([-*+]) \[(.)\](?: (.*))?$/;

/** Recognized-in-place tokens (scanned, never removed from displayText). */
const DUE_RE = new RegExp(`due\\s*@\\s*(${DATE_SRC})`);
const TAG_RE = /(?:^|\s)#([A-Za-z0-9_/-]+)/g;
const LINK_RE = /\[\[([^\]]+)\]\]/g;

/** Parse a line into a Todo, or return null if the line is not a todo. */
export function parseTodoLine(line: string): Todo | null {
  if (line.endsWith("\r")) line = line.slice(0, -1); // tolerate CRLF
  const m = TODO_RE.exec(line);
  if (!m) return null;

  const indent = m[1];
  const bullet = m[2];
  const glyph = m[3];
  const afterBox = m[4] ?? "";

  const { capsule, rest } = extractCapsule(afterBox);
  const displayText = rest.replace(/\s+$/, "");

  const dueMatch = DUE_RE.exec(displayText);
  // `due @ 2026-9-14` counts; the field is always canonical `YYYY-MM-DD`.
  const due = dueMatch ? canonicalDate(dueMatch[1]) : null;
  const tags = [...displayText.matchAll(TAG_RE)].map((x) => x[1]);
  const links = [...displayText.matchAll(LINK_RE)].map((x) => x[1]);

  return {
    id: capsule?.id ?? null,
    glyph,
    // Inline token wins; a legacy capsule `p=` is the fallback.
    priority: priorityFromText(displayText) ?? capsule?.priority ?? "NONE",
    displayText,
    indent,
    bullet,
    due,
    tags,
    links,
    extraTokens: capsule?.extraTokens ?? [],
  };
}
