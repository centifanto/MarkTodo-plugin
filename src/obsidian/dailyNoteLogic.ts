/**
 * Pure daily-note helpers — capture can target
 * today's daily note. No `obsidian` import: the date formatter is passed in
 * (Obsidian's bundled moment at runtime, a fake in tests), so the companion
 * app can reuse this with its own formatter.
 */

/** The Daily Notes core plugin's options, as stored in `.obsidian/daily-notes.json`. */
export interface DailyNoteOptions {
  folder?: string;
  format?: string;
  template?: string;
}

/** Formats `date` with a moment-style format string (e.g. "YYYY-MM-DD"). */
export type DateFormatter = (date: Date, format: string) => string;

export const DEFAULT_DAILY_FORMAT = "YYYY-MM-DD";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

/**
 * A moment-compatible formatter for the tokens daily-note formats actually use
 * (English names): YYYY YY · MMMM MMM MM M · DD D Do · dddd ddd · HH H hh h ·
 * mm ss · A a · `[literal]`. Portable (no moment dependency) so the companion
 * app can build the same daily-note paths.
 */
export const formatMomentLike: DateFormatter = (d, format) => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const h12 = d.getHours() % 12 || 12;
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()],
    MMM: MONTHS[d.getMonth()].slice(0, 3),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    Do: ordinal(d.getDate()),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    dddd: WEEKDAYS[d.getDay()],
    ddd: WEEKDAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    hh: pad(h12),
    h: String(h12),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
    A: d.getHours() < 12 ? "AM" : "PM",
    a: d.getHours() < 12 ? "am" : "pm",
  };
  return format.replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g,
    (m, literal: string | undefined) => (literal !== undefined ? literal : tokens[m]),
  );
};

/** Vault path of the daily note for `date` (folder + formatted name + `.md`). */
export function dailyNotePath(opts: DailyNoteOptions, date: Date, fmt: DateFormatter): string {
  const name = fmt(date, opts.format?.trim() || DEFAULT_DAILY_FORMAT);
  const folder = (opts.folder ?? "").trim().replace(/^\/+|\/+$/g, "");
  return `${folder ? folder + "/" : ""}${name}.md`;
}

/** The template note's vault path (Daily Notes stores it without `.md`), or null. */
export function dailyTemplatePath(opts: DailyNoteOptions): string | null {
  const t = (opts.template ?? "").trim().replace(/^\/+/, "");
  if (!t) return null;
  return /\.md$/i.test(t) ? t : `${t}.md`;
}

/**
 * Fill a daily-note template the way the core plugin does for its common
 * placeholders: `{{title}}`, `{{date}}`, `{{time}}`, and `{{date:FORMAT}}` /
 * `{{time:FORMAT}}`. Anything else is left untouched.
 */
export function applyDailyTemplate(
  template: string,
  title: string,
  date: Date,
  fmt: DateFormatter,
): string {
  return template.replace(
    /\{\{\s*(title|date|time)\s*(?::\s*([^}]+?)\s*)?\}\}/gi,
    (_m, key: string, custom: string | undefined) => {
      const k = key.toLowerCase();
      if (k === "title") return title;
      return fmt(date, custom ?? (k === "date" ? DEFAULT_DAILY_FORMAT : "HH:mm"));
    },
  );
}
