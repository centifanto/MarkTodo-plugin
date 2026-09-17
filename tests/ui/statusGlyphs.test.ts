import { describe, it, expect } from "vitest";
import { STATUS_ORDER } from "../../src/core/types";
import {
  GLYPH_GRID,
  STATUS_GLYPHS,
  glyphElements,
  glyphIconContent,
  glyphSvg,
} from "../../src/ui/statusGlyphs";

/** Minimal SVG path tokenizer: [command, args][] for the commands the glyphs use. */
function parsePath(d: string): [string, number[]][] {
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, A: 7, Z: 0 };
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: [string, number[]][] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!(cmd in arity)) throw new Error(`unsupported path command ${cmd} in ${d}`);
    const args = tokens.slice(i, i + arity[cmd]).map(Number);
    if (args.length !== arity[cmd] || args.some(Number.isNaN)) throw new Error(`bad args for ${cmd} in ${d}`);
    i += arity[cmd];
    out.push([cmd, args]);
  }
  return out;
}

/** Every absolute coordinate the path visits (endpoints only). */
function points(d: string): [number, number][] {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [cmd, a] of parsePath(d)) {
    if (cmd === "M" || cmd === "L") [x, y] = a;
    else if (cmd === "H") x = a[0];
    else if (cmd === "V") y = a[0];
    else if (cmd === "A") [x, y] = [a[5], a[6]];
    else continue;
    pts.push([x, y]);
  }
  return pts;
}

describe("status glyphs", () => {
  it("defines every status with well-formed path data", () => {
    for (const status of STATUS_ORDER) {
      const shapes = STATUS_GLYPHS[status];
      expect(shapes.length).toBeGreaterThan(0);
      for (const s of shapes) expect(() => parsePath(s.d)).not.toThrow();
    }
  });

  it("keeps every glyph inside the 24 grid with the stroke's 1px margin", () => {
    for (const status of STATUS_ORDER) {
      for (const s of STATUS_GLYPHS[status]) {
        const margin = s.paint === "stroke" ? 1 : 0;
        for (const [x, y] of points(s.d)) {
          expect(x - margin).toBeGreaterThanOrEqual(2);
          expect(x + margin).toBeLessThanOrEqual(22);
          expect(y - margin).toBeGreaterThanOrEqual(2);
          expect(y + margin).toBeLessThanOrEqual(22);
        }
      }
    }
  });

  it("squares, not circles: every status draws a box with straight edges", () => {
    for (const status of STATUS_ORDER) {
      const box = STATUS_GLYPHS[status][0].d;
      expect(box).toMatch(/H17/);
      expect(box).toMatch(/V17/);
    }
  });

  it("DONE is one filled even-odd shape: the box with the check knocked out", () => {
    const [done] = STATUS_GLYPHS.DONE;
    expect(STATUS_GLYPHS.DONE).toHaveLength(1);
    expect(done.paint).toBe("fill");
    expect(parsePath(done.d).filter(([c]) => c === "Z")).toHaveLength(2);
    expect(glyphElements("DONE")).toContain('fill-rule="evenodd"');
  });

  it("WARMING's dashes tile the box outline exactly (8 dashes + 8 gaps)", () => {
    const [warming] = STATUS_GLYPHS.WARMING;
    const [dash, gap] = warming.dash!.array.split(" ").map(Number);
    expect(dash).toBe(gap);
    expect(16 * dash).toBeCloseTo(40 + 8 * Math.PI, 2);
  });

  it("renders currentColor SVG for masks and a 100-unit addIcon group", () => {
    for (const status of STATUS_ORDER) {
      const svg = glyphSvg(status);
      expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH_GRID} ${GLYPH_GRID}">`)).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg.match(/<path /g)).toHaveLength(STATUS_GLYPHS[status].length);
      expect(svg).not.toMatch(/#[0-9a-f]{3,6}/i);
      expect(glyphIconContent(status)).toMatch(/^<g transform="scale\(4\.1666/);
    }
  });
});
