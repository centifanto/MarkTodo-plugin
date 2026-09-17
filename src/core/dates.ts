/**
 * In-place due-date editing. The due token lives inline in
 * `displayText` (in-place model), so setting/clearing it edits the text rather
 * than a structured field — never a full-line rewrite. `todo.due` is kept in sync.
 */
import { type Todo, statusOf } from "./types";

/**
 * A date as a person types it: `YYYY-M-D` — the month and day may
 * drop their leading zero (`2026-9-14`). The canonical form is `YYYY-MM-DD`: the
 * parser reports that, and MarkTodo writes it back whenever it rewrites a line.
 * `(?!\d)` keeps `2026-09-145` from reading as the 14th.
 */
export const DATE_SRC = "\\d{4}-\\d{1,2}-\\d{1,2}(?!\\d)";
/** A reminder time as typed: `H:MM` or `HH:MM` (canonical `HH:MM`). */
export const TIME_SRC = "\\d{1,2}:\\d{2}(?!\\d)";

const DUE_RE = new RegExp(`due\\s*@\\s*${DATE_SRC}`);
/** `done @ YYYY-MM-DD` as a whole word (so e.g. `undone @` never matches). */
const DONE_RE = new RegExp(`(^|\\s+)done\\s*@\\s*${DATE_SRC}`);
const DONE_DATE_RE = new RegExp(`(?:^|\\s)done\\s*@\\s*(${DATE_SRC})`);
const NOTIFY_AT_RE = new RegExp(`(?:^|\\s)notify\\s*@\\s*(${DATE_SRC})\\s+(${TIME_SRC})`);
/** The date-bearing tokens: `due @`, `done @`, and the app's `notify @ … H:MM`. */
const DATE_TOKEN_RE = new RegExp(`(done|due|notify)(\\s*@\\s*)(${DATE_SRC})(?:(\\s+)(${TIME_SRC}))?`, "g");

/** `2026-9-4` → `2026-09-04`; an already-canonical date comes back unchanged. */
export function canonicalDate(typed: string): string {
  const [y, m, d] = typed.split("-");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** `9:05` → `09:05`. */
export function canonicalTime(typed: string): string {
  const [h, min] = typed.split(":");
  return `${h.padStart(2, "0")}:${min}`;
}

/**
 * Pad every `due @` / `done @` date and every `notify @` date + time to the
 * canonical form, leaving all other text byte-identical — the same token
 * boundaries the readers use (`done` is a whole word; `notify` needs its time).
 * The serializer runs this, so a hand-typed `due @ 2026-9-14` becomes
 * `due @ 2026-09-14` the next time MarkTodo writes the line. Idempotent.
 */
export function canonicalDateTokens(text: string): string {
  return text.replace(
    DATE_TOKEN_RE,
    (m, kind: string, at: string, date: string, gap: string | undefined, time: string | undefined, offset: number) => {
      if (kind === "done" && offset > 0 && !/\s/.test(text[offset - 1])) return m;
      if (kind === "notify" && time === undefined) return m;
      const tail = time === undefined ? "" : kind === "notify" ? `${gap}${canonicalTime(time)}` : `${gap}${time}`;
      return `${kind}${at}${canonicalDate(date)}${tail}`;
    },
  );
}

/** A Date's LOCAL calendar day as `YYYY-MM-DD` (not UTC — 11pm today is still today). */
export function localIsoDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The `done @` date in a todo's text, or null. */
export function doneDateOf(todo: Todo): string | null {
  // The regex needs the literal word, so a substring miss is a definite null —
  // and `indexOf` is a great deal cheaper than a regex over every todo in the
  // vault, which the Today view and the counts do on each pass.
  if (todo.displayText.indexOf("done") === -1) return null;
  const m = DONE_DATE_RE.exec(todo.displayText);
  return m ? canonicalDate(m[1]) : null;
}

/**
 * The `notify @ YYYY-MM-DD HH:MM` reminder in a todo's text, canonical
 * (zero-padded), or null.
 *
 * The APP acts on this — it is the only one that can raise a notification — but
 * the token is part of the shared format, so the accessor belongs beside
 * `doneDateOf` rather than being re-derived per program. The plugin reads it for
 * the Today view's Reminders segment: on the desktop it is a review surface,
 * "what did I ask my phone to nag me about".
 */
export function notifyAtOf(todo: Todo): string | null {
  if (todo.displayText.indexOf("notify") === -1) return null;
  const m = NOTIFY_AT_RE.exec(todo.displayText);
  return m ? `${canonicalDate(m[1])} ${canonicalTime(m[2])}` : null;
}

/**
 * Keep the `done @ YYYY-MM-DD` token in step with the glyph: a DONE todo
 * carries one (an existing date is kept, so re-saving never re-dates it); any
 * other status carries none. Writers call this after every status change.
 * Idempotent; returns the same object when nothing changes.
 */
export function syncDoneDate(todo: Todo, today: string): Todo {
  const has = doneDateOf(todo) !== null;
  if (statusOf(todo) === "DONE") {
    if (has) return todo;
    const text = todo.displayText.trimEnd();
    return { ...todo, displayText: text.length > 0 ? `${text} done @ ${today}` : `done @ ${today}` };
  }
  if (!has) return todo;
  const text = todo.displayText.replace(DONE_RE, "").replace(/\s{2,}/g, " ").trim();
  return { ...todo, displayText: text };
}

/** Set, replace, or (date === null) remove the due token in a todo's text. */
export function setDue(todo: Todo, date: string | null): Todo {
  let text = todo.displayText;

  if (date === null) {
    text = text.replace(DUE_RE, "").replace(/\s{2,}/g, " ").trim();
  } else if (DUE_RE.test(text)) {
    text = text.replace(DUE_RE, `due @ ${date}`);
  } else {
    text = text.length > 0 ? `${text.trimEnd()} due @ ${date}` : `due @ ${date}`;
  }

  return { ...todo, displayText: text, due: date };
}
