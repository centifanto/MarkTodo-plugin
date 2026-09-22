/**
 * Editing a todo's title. The title a person edits is the
 * todo's text WITHOUT the tokens MarkTodo manages through other controls —
 * priority (`@high`, aliases), `due @ …`, `done @ … HH:MM`, and the app's
 * `notify @ … HH:MM` / `delete-after @ Nd` — while `[[links]]` and `#tags` stay
 * part of the title, as typed.
 *
 * Saving puts the new title first and re-attaches the kept tokens after it, in
 * their original order. A token of a kind the new title itself contains (say
 * the person typed `@ph` or `due @ 2026-10-01`) replaces the old one. Fields
 * (priority, due, tags, links) are re-derived by re-parsing the would-be line,
 * so nothing is written that the parser wouldn't round-trip.
 *
 * PURE — no Obsidian/DOM/IO. Shared by the plugin and the app (copied verbatim).
 */
import { type Todo } from "./types";
import { parseTodoLine } from "./parse";
import { serializeTodoLine } from "./serialize";
import { priorityFromText } from "./priority";
import { DATE_SRC, TIME_SRC } from "./dates";

type Kind = "priority" | "due" | "done" | "notify" | "deleteAfter";

const TOKEN_SOURCES: ReadonlyArray<readonly [Kind, string]> = [
  ["priority", "(^|\\s)(@(?:urgent|high|low|pu|ph|pl))(?=\\s|$)"],
  ["due", `()(due\\s*@\\s*${DATE_SRC})`],
  ["done", `(^|\\s)(done\\s*@\\s*${DATE_SRC}(?:\\s+${TIME_SRC})?)`],
  ["notify", `()(notify\\s*@\\s*${DATE_SRC}\\s+${TIME_SRC})`],
  ["deleteAfter", "()(delete-after\\s*@\\s*\\d+d)"],
];

interface Token {
  kind: Kind;
  text: string;
  start: number;
  end: number;
}

function machineTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const [kind, src] of TOKEN_SOURCES) {
    for (const m of text.matchAll(new RegExp(src, "gi"))) {
      const start = (m.index ?? 0) + m[1].length;
      out.push({ kind, text: m[2], start, end: start + m[2].length });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function removeTokens(text: string, tokens: readonly Token[]): string {
  let out = "";
  let at = 0;
  for (const t of tokens) {
    out += text.slice(at, t.start);
    at = t.end;
  }
  return (out + text.slice(at)).replace(/\s{2,}/g, " ").trim();
}

/** The editable title: the todo's text minus the tokens other controls manage. */
export function editableTitle(displayText: string): string {
  return removeTokens(displayText, machineTokens(displayText));
}

/**
 * Replace a todo's title, keeping its managed tokens. An empty title (after
 * trimming) or an unchanged one returns the todo untouched.
 */
export function setTitle(todo: Todo, title: string): Todo {
  // One line only, and never anything that could open a capsule comment.
  const clean = title.replace(/[\r\n]+/g, " ").replace(/<!--/g, "").replace(/\s{2,}/g, " ").trim();
  if (clean === "" || clean === editableTitle(todo.displayText)) return todo;

  const typedKinds = new Set(machineTokens(clean).map((t) => t.kind));
  const kept = machineTokens(todo.displayText)
    .filter((t) => !typedKinds.has(t.kind))
    .map((t) => t.text);
  const displayText = [clean, ...kept].join(" ");
  const priority = priorityFromText(displayText) ?? (typedKinds.has("priority") ? "NONE" : todo.priority);

  const reparsed = parseTodoLine(serializeTodoLine({ ...todo, displayText, priority }));
  return reparsed ?? todo;
}
