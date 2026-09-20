/**
 * Tiny color math for theme derivation — pure, no dependencies.
 *
 * A copy of the companion app's, deliberately NOT a shared file: the plugin
 * and the app may look different. Only the math is the same.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

/** hsl(h 0–360, s 0–100, l 0–100) → `#rrggbb`, or `#rrggbbaa` when alpha < 1. */
export function hsl(h: number, s: number, l: number, alpha = 1): string {
  const hh = (((h % 360) + 360) % 360) / 60;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = ll - c / 2;
  const [r1, g1, b1] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return toHex({r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255, a: alpha});
}

export function toHex({r, g, b, a}: Rgb): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a >= 1 ? base.toUpperCase() : `${base}${hex2(a * 255)}`.toUpperCase();
}

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) {
    throw new Error(`Not a #rrggbb[aa] color: ${hex}`);
  }
  const n = parseInt(m[1], 16);
  return {r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1};
}

/** `#rrggbb` → the same color as `{h, s, l}`, the shape Obsidian's `--accent-*` wants. */
export function toHsl(hex: string): {h: number; s: number; l: number} {
  const {r, g, b} = parseHex(hex);
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return {h: 0, s: 0, l: l * 100};
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return {h: ((h * 60) % 360 + 360) % 360, s: s * 100, l: l * 100};
}

export function withAlpha(hex: string, alpha: number): string {
  return toHex({...parseHex(hex), a: alpha});
}

/** Paint `top` (possibly translucent) over an opaque `bottom`. */
export function composite(top: string, bottom: string): string {
  const t = parseHex(top);
  const b = parseHex(bottom);
  const mix = (x: number, y: number) => x * t.a + y * (1 - t.a);
  return toHex({r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: 1});
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const {r, g, b} = parseHex(hex);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1–21) between two opaque colors. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Smallest angular distance between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
