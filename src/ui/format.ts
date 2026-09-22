/**
 * Display-only title formatting (rendering is painted on top, never
 * persisted). The stored `displayText` keeps everything inline; for the
 * UI we drop the `due @ …` token (shown as a pill instead) and the priority
 * token (shown as an icon), and hide the bookkeeping tokens — `done @` (the
 * glyph already says done) and the companion app's `notify @ … HH:MM` /
 * `delete-after @ Nd`. PURE — never touches storage.
 *
 * Links stay LINKS. A todo's text is ordinary markdown, so `[[a note]]`,
 * `[label](https://…)` and a bare URL all mean what they mean everywhere else
 * in Obsidian; `titleSegments` cuts a title into the runs of plain text and the
 * links between them, and the row renders the links as anchors. `formatTitle`
 * is the same thing flattened to plain text, for searching, sorting and any
 * place that needs a string (a confirm dialog, a tooltip).
 */
import { stripPriorityTokens } from "../core/priority";
import { DATE_SRC, TIME_SRC } from "../core/dates";

const DUE_RE = new RegExp(`\\s*due\\s*@\\s*${DATE_SRC}`);
// The time is optional: stamps written before `done @` carried one are bare dates.
const DONE_RE = new RegExp(`(^|\\s+)done\\s*@\\s*${DATE_SRC}(?:\\s+${TIME_SRC})?`);
const NOTIFY_RE = new RegExp(`\\s*notify\\s*@\\s*${DATE_SRC}\\s+${TIME_SRC}`);
const DELETE_AFTER_RE = /\s*delete-after\s*@\s*\d+d/;

/**
 * One pass over the three link spellings, in precedence order:
 *  1. `[[note]]`, `[[note#heading]]`, `[[note|alias]]` — Obsidian's own.
 *  2. `[label](target)` — markdown. The target may be a URL or a note path.
 *  3. a bare `https://…` / `http://…` / `mailto:…`.
 *
 * The bare-URL branch excludes `)` and `]` so it can't swallow the tail of a
 * markdown link, and trailing sentence punctuation is trimmed off the match
 * afterwards (`see https://x.com.` links `https://x.com`, not `…com.`).
 */
const LINK_TOKEN_RE =
  /\[\[([^[\]]+?)\]\]|\[([^\]]*)\]\(([^()\s]+)\)|((?:https?:\/\/|mailto:)[^\s<>[\]()]+)/g;

/** A URL scheme MarkTodo will hand to the browser. Anything else is a note link. */
const EXTERNAL_RE = /^(?:https?:\/\/|mailto:)/i;

const TRAILING_PUNCT_RE = /[.,;:!?]+$/;

export type TitleSegment =
  /** Plain text, rendered as-is. */
  | { kind: "text"; text: string }
  /** A link to a note in this vault. `target` is the linkpath (may carry `#heading`). */
  | { kind: "note"; text: string; target: string }
  /** A link out of the vault. `target` is the URL. */
  | { kind: "url"; text: string; target: string };

/** The tokens that are shown by another control, removed. */
function stripTokens(displayText: string): string {
  return stripPriorityTokens(displayText)
    .replace(DUE_RE, "")
    .replace(DONE_RE, "")
    .replace(NOTIFY_RE, "")
    .replace(DELETE_AFTER_RE, "");
}

/**
 * A title cut into text runs and links.
 *
 * Whitespace is collapsed and the ends trimmed exactly as `formatTitle` does,
 * so the two can never render a title differently — `formatTitle` is literally
 * these segments joined back together.
 */
export function titleSegments(displayText: string): TitleSegment[] {
  const text = stripTokens(displayText).replace(/\s{2,}/g, " ").trim();
  const out: TitleSegment[] = [];
  let at = 0;
  const pushText = (s: string): void => {
    if (s !== "") out.push({ kind: "text", text: s });
  };

  LINK_TOKEN_RE.lastIndex = 0;
  for (let m = LINK_TOKEN_RE.exec(text); m !== null; m = LINK_TOKEN_RE.exec(text)) {
    const [whole, wiki, mdLabel, mdTarget, bare] = m;
    let consumed = whole.length;
    let segment: TitleSegment;

    if (wiki !== undefined) {
      // `[[target|alias]]`: the alias is what you read, the target is where it goes.
      const bar = wiki.indexOf("|");
      const target = (bar === -1 ? wiki : wiki.slice(0, bar)).trim();
      const alias = bar === -1 ? "" : wiki.slice(bar + 1).trim();
      segment = { kind: "note", text: alias || target, target };
    } else if (mdTarget !== undefined) {
      const label = (mdLabel ?? "").trim();
      segment = EXTERNAL_RE.test(mdTarget)
        ? { kind: "url", text: label || mdTarget, target: mdTarget }
        : { kind: "note", text: label || mdTarget, target: mdTarget };
    } else {
      const url = (bare ?? "").replace(TRAILING_PUNCT_RE, "");
      // Punctuation trimmed off the URL is ordinary text, not part of the link.
      consumed = whole.length - ((bare ?? "").length - url.length);
      segment = { kind: "url", text: url, target: url };
    }

    pushText(text.slice(at, m.index));
    out.push(segment);
    at = m.index + consumed;
    LINK_TOKEN_RE.lastIndex = at;
  }
  pushText(text.slice(at));
  return out;
}

/** The title as plain text — the segments, flattened. */
export function formatTitle(displayText: string): string {
  return titleSegments(displayText)
    .map((s) => s.text)
    .join("");
}
