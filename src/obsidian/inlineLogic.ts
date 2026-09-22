/**
 * Pure inline-todo logic (no Obsidian / DOM / IO), split out of `inlineTodo.ts`
 * so it can be unit-tested directly — the same pure/glue split as `indexLogic`
 * vs `index` and `writeLogic` vs `writer`. Depends only on the core layer.
 */
import {
  STATUS_GLYPH,
  statusFromGlyph,
  type Priority,
  type Status,
  type Todo,
} from "../core/types";
import { generateId } from "../core/id";
import { parseTodoLine } from "../core/parse";
import { serializeTodoLine } from "../core/serialize";
import { normalizePriorityTokens } from "../core/priority";
import { setPriority } from "../core/status";
import { localIsoStamp, setDue, syncDoneAt } from "../core/dates";
import { canSetStatus, type Placement } from "./placement";

/** Where an inline insert/convert landed — enough to open the todo modal on it. */
export interface InlineResult {
  line: number;
  text: string;
}

/** The two halves of a fresh managed todo line; the title goes between them. */
export function managedScaffold(status: Status): { head: string; tail: string } {
  return {
    head: `- [${STATUS_GLYPH[status]}] `,
    tail: ` <!-- mt id=${generateId()} -->`,
  };
}

const ALIAS_BEFORE_CURSOR = /(^|\s)(@(?:pu|ph|pl))$/i;

/**
 * Live priority-alias expansion: when a space is about to be typed at
 * `ch` on a todo line and the text just before it is `@pu` / `@ph` / `@pl`,
 * return the span to replace and its canonical token (`@urgent` …). Null when
 * the line isn't a todo or there's no alias right before the cursor.
 */
export function aliasExpansionAt(
  lineText: string,
  ch: number,
): { from: number; to: number; insert: string } | null {
  if (parseTodoLine(lineText) === null) return null;
  const before = lineText.slice(0, ch);
  const m = ALIAS_BEFORE_CURSOR.exec(before);
  if (!m) return null;
  const alias = m[2];
  const insert = normalizePriorityTokens(alias);
  return { from: ch - alias.length, to: ch, insert };
}

// ── Keyword combo ──────────────────────────────────────────────────────────

/** What the keyword popup can do with the line it was typed on. */
export type CaptureAction = "here" | "editor" | "catchall" | "edit";

/** Canonical order of the capture actions (the default is lifted first). */
const CAPTURE_ORDER: readonly Exclude<CaptureAction, "edit">[] = ["here", "editor", "catchall"];

/**
 * Where the trigger may fire on `before` (the line text up to the cursor):
 * the trigger must end the text, and — when it starts with a word character
 * (e.g. "mtodo") — begin a word, so "xmtodo" or a URL never fires it. A
 * punctuation trigger (";t") may be glued to the text ("milk;t"). Headings
 * never fire. Returns the trigger's start column and any word characters typed
 * straight after it (the popup filters on them), or null.
 */
export function findTrigger(
  before: string,
  trigger: string,
): { start: number; query: string } | null {
  if (!trigger) return null;
  const esc = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^\w/.test(trigger) ? "(^|\\s)" : "()";
  const m = new RegExp(lead + esc + "(\\w*)$").exec(before);
  if (!m) return null;
  const start = before.length - (m[0].length - m[1].length);
  if (/^\s*#{1,6}\s/.test(before.slice(0, start))) return null;
  return { start, query: m[2] };
}

/**
 * The line with the trigger span [fromCh, toCh) removed, as a todo. A checkbox
 * line parses as itself; a plain list item gains a checkbox (`- note` →
 * `- [ ] note`); any other text becomes `- [ ] text` (indent kept). Blank text
 * yields a todo with an empty title. `wasTodo` says whether a checkbox existed.
 */
export function lineToTodo(
  raw: string,
  fromCh: number,
  toCh: number,
): { todo: Todo; wasTodo: boolean } | null {
  const cleaned = (raw.slice(0, fromCh) + raw.slice(toCh)).replace(/\s+$/, "");
  const existing = parseTodoLine(cleaned);
  if (existing) return { todo: existing, wasTodo: true };
  const item = /^(\s*)([-*+])\s+(.*)$/.exec(cleaned);
  const candidate = item
    ? `${item[1]}${item[2]} [ ] ${item[3]}`
    : cleaned.replace(/^(\s*)(.*)$/, "$1- [ ] $2");
  const todo = parseTodoLine(candidate);
  return todo ? { todo, wasTodo: false } : null;
}

/**
 * Status for a todo captured in place: in a project, a checkbox's own known
 * status is kept, else the default; a loose todo keeps BACKLOG/DONE, else
 * BACKLOG.
 */
export function captureStatus(
  placement: Placement,
  todo: Todo,
  wasTodo: boolean,
  defaultStatus: Status,
): Status {
  const own = wasTodo ? statusFromGlyph(todo.glyph) : null;
  if (placement === "project") return own ?? defaultStatus;
  return own !== null && canSetStatus("loose", own) ? own : "BACKLOG";
}

/**
 * The popup rows for a line, default action first. An already-managed
 * line only offers "Edit todo…". "Send to <catch-all>" appears only when a
 * catch-all note is configured (`catchAll`: set, and not the note being typed
 * in) and the line has text to send.
 */
export function captureActions(opts: {
  defaultAction: Exclude<CaptureAction, "edit">;
  catchAll: boolean;
  managed: boolean;
  blank: boolean;
}): CaptureAction[] {
  if (opts.managed) return ["edit"];
  const available = CAPTURE_ORDER.filter(
    (a) => a !== "catchall" || (opts.catchAll && !opts.blank),
  );
  const first = available.includes(opts.defaultAction) ? [opts.defaultAction] : [];
  return [...first, ...available.filter((a) => a !== opts.defaultAction)];
}

/**
 * A captured todo line for the todo editor's create mode: the typed title
 * (which may itself carry `@priority` / `due @` tokens) with the editor's
 * chosen status, priority and due applied on top. `priority`/`due` of
 * `undefined` keep whatever the title says; `due: null` clears it. Null for an
 * empty title.
 */
export function buildCaptureLine(opts: {
  title: string;
  status: Status;
  priority?: Priority;
  due?: string | null;
  id: string;
  /** Local `done @` stamp when the status is DONE (default: now). */
  doneAt?: string;
}): string | null {
  const title = opts.title.trim();
  if (title === "") return null;
  let todo = parseTodoLine(`- [${STATUS_GLYPH[opts.status]}] ${title}`);
  if (todo === null) return null;
  if (opts.priority !== undefined) todo = setPriority(todo, opts.priority);
  if (opts.due !== undefined) todo = setDue(todo, opts.due);
  todo = syncDoneAt(todo, opts.doneAt ?? localIsoStamp(new Date()));
  return serializeTodoLine({ ...todo, id: opts.id });
}
