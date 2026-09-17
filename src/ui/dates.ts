/**
 * Pure calendar helpers for the Today view's date headers. Dates are plain
 * `YYYY-MM-DD` strings on the LOCAL calendar (the vault's `due @` format), so
 * nothing here ever goes through UTC.
 *
 * Mirrors the app's date helpers (same names, same output) — the plugin
 * only needs the three the Today view uses, not the month-grid picker.
 */
import { localIsoDate } from "../core/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local-midnight Date for a `YYYY-MM-DD` string. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a date by whole days (DST-safe: works on calendar fields). */
export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

/** Human label for a date: Today / Tomorrow / Yesterday / "Mon, Sep 21" / "Sep 21, 2027". */
export function friendlyDate(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  const d = fromIso(iso);
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === fromIso(today).getFullYear()
    ? `${WEEKDAYS[d.getDay()]}, ${md}`
    : `${md}, ${d.getFullYear()}`;
}
