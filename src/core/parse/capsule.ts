/**
 * Parser for the hidden metadata capsule:
 *
 *   <!-- mt id=<id> [p=<priority>] [future-key=value ...] -->
 *
 * Forward-compatible by construction: the inner string is tokenized on
 * whitespace into `key=value` pairs; recognized keys (`id`, `p`) are lifted out
 * and EVERYTHING ELSE is preserved verbatim in `extraTokens` so a newer writer's
 * keys are never dropped on round-trip. An unrecognized `p=` value is likewise
 * preserved as an extra token rather than silently normalized to NONE.
 */

import { type Priority, TOKEN_TO_PRIORITY } from "../types";

/**
 * Matches a TRAILING `mt` capsule and captures its inner tokens. Anchored to the
 * end so a comment a user typed mid-line is left in place (preserved verbatim,
 * byte-stable) rather than relocated to the end on serialize.
 */
const CAPSULE_RE = /<!--\s*mt\s+(.*?)\s*-->\s*$/;

export interface ParsedCapsule {
  id: string | null;
  priority: Priority;
  /** Tokens we don't recognize, kept verbatim (forward-compat). */
  extraTokens: string[];
}

export interface CapsuleExtraction {
  /** The parsed capsule, or null when the text contains none. */
  capsule: ParsedCapsule | null;
  /** Input with the capsule removed and right-trimmed; unchanged when none. */
  rest: string;
}

/** Pull the `mt` capsule out of a piece of text (typically a todo's post-checkbox body). */
export function extractCapsule(text: string): CapsuleExtraction {
  const m = CAPSULE_RE.exec(text);
  if (!m || m.index === undefined) return { capsule: null, rest: text };

  const inner = m[1].trim();
  const tokens = inner.length > 0 ? inner.split(/\s+/) : [];

  let id: string | null = null;
  let priority: Priority = "NONE";
  const extraTokens: string[] = [];

  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq <= 0) {
      // bare or malformed token (no key) — preserve verbatim
      extraTokens.push(tok);
      continue;
    }
    const key = tok.slice(0, eq);
    const value = tok.slice(eq + 1);
    if (key === "id") {
      if (value.length > 0) id = value; // empty id is malformed → leave unmanaged
    } else if (key === "p") {
      const mapped = TOKEN_TO_PRIORITY[value];
      if (mapped) priority = mapped;
      else extraTokens.push(tok); // unknown priority value: don't drop it
    } else {
      extraTokens.push(tok);
    }
  }

  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(
    /\s+$/,
    "",
  );
  return { capsule: { id, priority, extraTokens }, rest };
}
