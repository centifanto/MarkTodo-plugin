/**
 * MarkTodo status glyphs — rounded squares, not circles. Pure geometry shared by
 * both programs: the plugin turns it into Obsidian icons (`addIcon`) and Live
 * Preview / Reading view checkbox masks; the companion app copies this file
 * byte-identical and draws the same paths with react-native-svg, and its widget
 * uses the same path data as vector drawables.
 *
 * 24×24 grid, Lucide-style round 2px strokes. The outlined box's OUTER edge
 * (2..22, radius 5) equals the filled DONE box, so every status has the same
 * footprint. DONE knocks the check out of the fill (`evenodd`), like Obsidian's
 * own checked checkbox — no second color needed, so it also works as a CSS mask.
 */
import type { Status } from "../core/types";

export interface GlyphShape {
  /** SVG path data in the 24×24 grid. */
  d: string;
  /** `stroke`: 2px round outline. `fill`: solid, even-odd (holes stay empty). */
  paint: "stroke" | "fill";
  /** stroke-dasharray / stroke-dashoffset, for dashed outlines. */
  dash?: { array: string; offset: number };
}

export const GLYPH_GRID = 24;
export const GLYPH_STROKE = 2;

/** Outlined box: x/y 3..21, corner radius 4 (stroke centered → outer edge 2..22, r 5). */
const BOX = "M7 3H17A4 4 0 0 1 21 7V17A4 4 0 0 1 17 21H7A4 4 0 0 1 3 17V7A4 4 0 0 1 7 3Z";
/** Filled box matching the outlined box's outer edge. */
const SOLID_BOX = "M7 2H17A5 5 0 0 1 22 7V17A5 5 0 0 1 17 22H7A5 5 0 0 1 2 17V7A5 5 0 0 1 7 2Z";
/** The outline of a 2.5px round-capped check (8.5,12)→(11,14.5)→(15.5,10), as a hole. */
const CHECK_HOLE =
  "M7.616 12.884L10.116 15.384A1.25 1.25 0 0 0 11.884 15.384L16.384 10.884" +
  "A1.25 1.25 0 0 0 14.616 9.116L11 12.732L9.384 11.116A1.25 1.25 0 0 0 7.616 12.884Z";
/** Perimeter of BOX = 4·10 + 2π·4. Sixteen equal dash/gap units → eight dashes, */
const BOX_PERIMETER = 40 + 8 * Math.PI;
const DASH = BOX_PERIMETER / 16;
/** …shifted so a dash is centered on each edge and each corner. */
const DASH_OFFSET = -(5 - DASH / 2);

const dot = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;

export const STATUS_GLYPHS: Record<Status, GlyphShape[]> = {
  BACKLOG: [{ d: BOX, paint: "stroke" }],
  WARMING: [
    {
      d: BOX,
      paint: "stroke",
      dash: { array: `${DASH.toFixed(4)} ${DASH.toFixed(4)}`, offset: Number(DASH_OFFSET.toFixed(4)) },
    },
  ],
  PROGRESS: [
    { d: BOX, paint: "stroke" },
    { d: dot(12, 12, 2.5), paint: "fill" },
  ],
  BLOCKED: [
    { d: BOX, paint: "stroke" },
    { d: "M12 7.5V12.5", paint: "stroke" },
    { d: dot(12, 16.25, 1.25), paint: "fill" },
  ],
  PAUSED: [
    { d: BOX, paint: "stroke" },
    { d: "M10 9V15M14 9V15", paint: "stroke" },
  ],
  DONE: [{ d: SOLID_BOX + CHECK_HOLE, paint: "fill" }],
};

/** The glyph's shapes as SVG elements painted with `currentColor` (24×24 coordinates). */
export function glyphElements(status: Status): string {
  return STATUS_GLYPHS[status]
    .map((s) =>
      s.paint === "fill"
        ? `<path d="${s.d}" fill="currentColor" fill-rule="evenodd" stroke="none"/>`
        : `<path d="${s.d}" fill="none" stroke="currentColor" stroke-width="${GLYPH_STROKE}" ` +
          `stroke-linecap="round" stroke-linejoin="round"` +
          (s.dash ? ` stroke-dasharray="${s.dash.array}" stroke-dashoffset="${s.dash.offset}"` : "") +
          `/>`,
    )
    .join("");
}

/** A standalone SVG document (for CSS `mask-image` data URIs). */
export function glyphSvg(status: Status): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH_GRID} ${GLYPH_GRID}">` +
    glyphElements(status) +
    `</svg>`
  );
}

/** `addIcon` content: Obsidian icons live in a 0 0 100 100 view box. */
export function glyphIconContent(status: Status): string {
  return `<g transform="scale(${100 / GLYPH_GRID})">${glyphElements(status)}</g>`;
}
