/**
 * Inline priority tokens.
 *
 * Priority lives in the todo's visible text, like `due @`: `@urgent`, `@high`,
 * `@low` (NONE writes nothing). The quick-entry aliases `@pu`, `@ph`, `@pl` are
 * recognized too and normalized to the canonical lowercase word whenever
 * MarkTodo writes the line. A token is a whole word: at the start of the text or
 * after whitespace, and followed by whitespace or the end — so `bob@high.com`
 * or `@high-school` are ordinary text.
 *
 * Legacy lines stored priority in the capsule (`p=high`); the parser still
 * reads that as a fallback, and the serializer moves it into the text.
 *
 * PURE — no Obsidian/DOM/IO. Regexes avoid lookbehind (mobile-safe).
 */
import { type Priority, PRIORITY_TOKEN } from "./types";
import { DATE_SRC } from "./dates";

type Level = Exclude<Priority, "NONE">;

/** Token word (lowercase) → priority: canonical words + quick-entry aliases. */
const WORD_TO_PRIORITY: Readonly<Record<string, Level>> = {
  urgent: "URGENT",
  high: "HIGH",
  low: "LOW",
  pu: "URGENT",
  ph: "HIGH",
  pl: "LOW",
};

const TOKEN_SRC = "(^|\\s)@(urgent|high|low|pu|ph|pl)(?=\\s|$)";
const DUE_RE = new RegExp(`due\\s*@\\s*${DATE_SRC}`);

/** The canonical inline token for a priority (`@high`), or null for NONE. */
export function priorityToken(priority: Priority): string | null {
  return priority === "NONE" ? null : `@${PRIORITY_TOKEN[priority]}`;
}

/** Priority of the FIRST priority token in the text, or null when there is none. */
export function priorityFromText(text: string): Level | null {
  const m = new RegExp(TOKEN_SRC, "i").exec(text);
  return m ? WORD_TO_PRIORITY[m[2].toLowerCase()] : null;
}

/** Does the text contain any priority token (canonical or alias, any case)? */
export function hasPriorityToken(text: string): boolean {
  return new RegExp(TOKEN_SRC, "i").test(text);
}

/** Rewrite every priority token (aliases, any case) to its canonical lowercase word. */
export function normalizePriorityTokens(text: string): string {
  return text.replace(
    new RegExp(TOKEN_SRC, "gi"),
    (_m, pre: string, word: string) =>
      pre + "@" + PRIORITY_TOKEN[WORD_TO_PRIORITY[word.toLowerCase()]],
  );
}

/** Remove every priority token, taking one adjacent space with each. */
export function stripPriorityTokens(text: string): string {
  const out = text.replace(new RegExp(TOKEN_SRC, "gi"), "");
  // A token at the very start leaves the space that followed it.
  return /^\s/.test(text) ? out : out.replace(/^\s+/, "");
}

/**
 * Make the text agree with `priority` (the in-place edit behind setPriority and
 * the serializer):
 *  - aliases/case are normalized everywhere;
 *  - NONE removes every token;
 *  - otherwise the FIRST token becomes the canonical word, or — when there is
 *    none — the token is inserted before a `due @` token, else appended.
 * Idempotent: applying it twice equals applying it once.
 */
export function withPriority(text: string, priority: Priority): string {
  const normalized = normalizePriorityTokens(text);
  const token = priorityToken(priority);
  if (token === null) return stripPriorityTokens(normalized);

  const re = new RegExp(TOKEN_SRC, "i");
  if (re.test(normalized)) {
    return normalized.replace(re, (_m, pre: string) => pre + token);
  }
  const due = DUE_RE.exec(normalized);
  if (due) {
    return normalized.slice(0, due.index) + token + " " + normalized.slice(due.index);
  }
  const trimmed = normalized.replace(/\s+$/, "");
  return trimmed.length > 0 ? `${trimmed} ${token}` : token;
}
