/**
 * Serialize a `Todo` back to its Markdown line.
 *
 * In-place model: `displayText` already holds the user's links/tags/dates/
 * priority tokens verbatim, so we never reorder them. Three things are (re)built:
 *  - the capsule, in CANONICAL order (`id`, then preserved unknown tokens);
 *  - the priority token, synced to `todo.priority` via `withPriority` (aliases
 *    normalized, a legacy capsule `p=` moved into the text);
 *  - typed dates padded in place (`due @ 2026-9-14` → `due @ 2026-09-14`).
 * All are fixpoints, which makes `serialize(parse(...))` idempotent.
 */

import { type Todo } from "../types";
import { withPriority } from "../priority";
import { canonicalDateTokens } from "../dates";

/**
 * Build the `<!-- mt ... -->` capsule, or null when the todo is unmanaged (no
 * id). Priority is never written here any more — it's an inline token.
 */
export function serializeCapsule(todo: Todo): string | null {
  if (todo.id === null) return null;
  const tokens = [`id=${todo.id}`, ...todo.extraTokens];
  return `<!-- mt ${tokens.join(" ")} -->`;
}

/** Serialize a Todo to its full Markdown line. */
export function serializeTodoLine(todo: Todo): string {
  const capsule = serializeCapsule(todo);
  const text = withPriority(canonicalDateTokens(todo.displayText), todo.priority);
  const head = `${todo.indent}${todo.bullet} [${todo.glyph}] ${text}`.replace(/\s+$/, "");
  return capsule === null ? head : `${head} ${capsule}`;
}
