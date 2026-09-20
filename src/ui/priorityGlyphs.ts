/**
 * MarkTodo priority glyphs — three ascending bars, the lit ones saying how
 * urgent. Pure geometry shared by both programs, exactly as `statusGlyphs.ts`
 * is: the plugin registers them as Obsidian icons (`addIcon`), the companion app
 * copies this file byte-identical and draws the same paths with react-native-svg,
 * and its widget uses the same path data as vector drawables.
 *
 * 24×24 grid, Lucide-style round strokes, so they sit beside Lucide icons
 * without looking borrowed.
 *
 * All three priorities draw all three bars and differ only in which are LIT —
 * the unlit ones stay as a faint track. One silhouette means the three read as
 * one scale you can compare at a glance, rather than three unrelated symbols;
 * it is also why these are MarkTodo's own glyphs and not Lucide names, since a
 * Lucide icon is a single stroke color and cannot show a track behind the bars.
 */
import type { Priority } from "../core/types";

export const BAR_GRID = 24;
export const BAR_STROKE = 3;
/** Unlit bars: present enough to read as a scale, quiet enough not to count. */
export const BAR_DIM = 0.3;

/** One bar: a round-capped vertical stroke, and whether this priority lights it. */
export interface BarShape {
  d: string;
  lit: boolean;
}

/**
 * The three bars, short to tall, on a shared baseline. Round caps add half the
 * stroke at each end, so the drawn glyph spans y 6.5..21.5 and x 4.5..19.5 —
 * centered horizontally, and sitting on the baseline the way a chart does.
 */
const BAR_X = [6, 12, 18];
const BAR_TOP = [16, 12, 8];
const BASELINE = 20;

const bar = (i: number): string => `M${BAR_X[i]} ${BASELINE}V${BAR_TOP[i]}`;

/** How many bars each priority lights. NONE draws no glyph at all. */
export const PRIORITY_BARS: Record<Exclude<Priority, "NONE">, number> = {
  LOW: 1,
  HIGH: 2,
  URGENT: 3,
};

export const PRIORITY_GLYPHS: Record<Exclude<Priority, "NONE">, BarShape[]> = {
  LOW: bars(PRIORITY_BARS.LOW),
  HIGH: bars(PRIORITY_BARS.HIGH),
  URGENT: bars(PRIORITY_BARS.URGENT),
};

function bars(lit: number): BarShape[] {
  return BAR_X.map((_, i) => ({ d: bar(i), lit: i < lit }));
}

/** The glyph's bars as SVG elements painted with `currentColor` (24×24 coordinates). */
export function priorityGlyphElements(priority: Exclude<Priority, "NONE">): string {
  return PRIORITY_GLYPHS[priority]
    .map(
      (b) =>
        `<path d="${b.d}" fill="none" stroke="currentColor" stroke-width="${BAR_STROKE}" ` +
        `stroke-linecap="round"` +
        (b.lit ? "" : ` opacity="${BAR_DIM}"`) +
        `/>`,
    )
    .join("");
}

/** A standalone SVG document (for the app, and for anything wanting a data URI). */
export function priorityGlyphSvg(priority: Exclude<Priority, "NONE">): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_GRID} ${BAR_GRID}">` +
    priorityGlyphElements(priority) +
    `</svg>`
  );
}

/** `addIcon` content: Obsidian icons live in a 0 0 100 100 view box. */
export function priorityIconContent(priority: Exclude<Priority, "NONE">): string {
  return `<g transform="scale(${100 / BAR_GRID})">${priorityGlyphElements(priority)}</g>`;
}
