/**
 * MarkTodo's color, ON TOP OF your Obsidian theme. PURE.
 *
 * The plugin does not paint its own surfaces. Backgrounds, text, borders and
 * controls are Obsidian's, whatever theme and light/dark you run — there is no
 * "MarkTodo theme" to switch to and no light/dark of its own to get out of step
 * with the vault around it.
 *
 * What MarkTodo still owns is COLOR THAT CARRIES MEANING:
 *
 *   - the SIX STATUS HUES, which are FIXED. The six names are fixed so a
 *     heading means the same thing in every vault; their colors are fixed for
 *     the same reason. A Doing column is the same blue on your screen as on
 *     mine, and a board is readable over someone's shoulder.
 *   - the DUE CHIPS — overdue, today, upcoming — which are about time, not
 *     state, and so get their own three.
 *   - your ACCENT, which colors CHROME only: selection, links, focus rings,
 *     buttons. It is the one thing here you choose, and it can't change what a
 *     status means.
 *
 * The palette is Flexoki (https://stephango.com/flexoki): its 600 step in
 * light, its 400 step in dark, which is what that palette prescribes for
 * colored text. Everything else — neutrals, surfaces, every shade of gray —
 * comes from your theme.
 *
 * How it reaches the screen: `themeProperties` yields custom properties for
 * `<body>` under carrier names (`--mtt-*`), plus the `--marktodo-*` status
 * colors. `obsidian/themeStyles.ts` sets them; styles.css gives the carriers
 * their real names inside `.marktodo-theme`, the class every MarkTodo pane and
 * dialog wears — so Obsidian's own controls in there take the accent too, and
 * the rest of Obsidian is untouched.
 */
import { composite, contrast, hsl, toHsl, withAlpha } from "./color";

/** A Flexoki hue. The accent presets and the fixed status colors both come from here. */
export type FlexokiHue = "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "magenta" | "base";

/** "obsidian" follows your Obsidian accent; the rest are Flexoki's. */
export type AccentKey = "obsidian" | FlexokiHue;

/**
 * The only appearance setting left. Theme style and light/dark are gone: both
 * are your Obsidian theme's to decide now.
 */
export interface Appearance {
  accent: AccentKey;
}

export const DEFAULT_APPEARANCE: Appearance = { accent: "obsidian" };

export interface AccentHsl {
  h: number;
  s: number;
  l: number;
}

/** One Flexoki hue at the two steps the palette prescribes: 600 light, 400 dark. */
export interface FlexokiRamp {
  label: string;
  light: string;
  dark: string;
}

/**
 * Flexoki, https://stephango.com/flexoki — the 600 and 400 steps of each hue.
 * "Light themes should use 600 for syntax highlighted text, dark themes should
 * use 400", which is exactly the job every color here does: a hue read as text
 * or as a small glyph against the theme's own background.
 *
 * `base` is Flexoki's neutral ramp (600/400), for an accent that stays out of
 * the way.
 */
export const ACCENTS: Record<FlexokiHue, FlexokiRamp> = {
  red: { label: "Red", light: "#AF3029", dark: "#D14D41" },
  orange: { label: "Orange", light: "#BC5215", dark: "#DA702C" },
  yellow: { label: "Yellow", light: "#AD8301", dark: "#D0A215" },
  green: { label: "Green", light: "#66800B", dark: "#879A39" },
  cyan: { label: "Cyan", light: "#24837B", dark: "#3AA99F" },
  blue: { label: "Blue", light: "#205EA6", dark: "#4385BE" },
  purple: { label: "Purple", light: "#5E409D", dark: "#8B7EC8" },
  magenta: { label: "Magenta", light: "#A02F6F", dark: "#CE5D97" },
  base: { label: "Base", light: "#6F6E69", dark: "#9F9D96" },
};

/** Obsidian's default accent is hsl(258 88% 66%) — `--accent-h/s/l`. */
export const OBSIDIAN_PURPLE: AccentHsl = { h: 258, s: 88, l: 66 };

/**
 * The six statuses, in Flexoki. FIXED — not derived from your accent.
 *
 * The reading, left to right through a todo's life: nothing started yet is
 * neutral; `warming` is heat; `doing` is the one live, cool, working color;
 * `blocked` is the stop everyone already reads as a stop; `paused` is set down
 * deliberately, so it is a color of its own rather than a dimmer red; `done` is
 * the only green, so green means finished and nothing else.
 */
const STATUS_HUES = {
  backlog: "base",
  warming: "yellow",
  doing: "blue",
  blocked: "red",
  paused: "purple",
  done: "green",
} as const satisfies Record<string, FlexokiHue>;

/**
 * The three due chips. Time, not state, so they do not reuse the status hues'
 * meanings: overdue is the same red as a stop, today is the same yellow as
 * heat, and upcoming is deliberately neutral — a date that is merely coming is
 * not urgent, and coloring it says it is.
 */
const CHIP_HUES = {
  overdue: "red",
  today: "yellow",
  upcoming: "base",
} as const satisfies Record<string, FlexokiHue>;

/** A Flexoki hue at the step for this mode. */
function step(hue: FlexokiHue, dark: boolean): string {
  return dark ? ACCENTS[hue].dark : ACCENTS[hue].light;
}

// ────────────────────────────────────────────────────────────────────────────
// Text size — a multiplier, not a set of pixel sizes
// ────────────────────────────────────────────────────────────────────────────

/**
 * How big MarkTodo's own text draws. A MULTIPLIER on the sizes Obsidian already
 * resolved, never a pixel value: your theme, your font-size setting and your
 * zoom all still decide the baseline, and this moves the whole MarkTodo pane
 * with it. Scaling a resolved size is also the only way to do this without
 * re-declaring Obsidian's `--font-ui-*` variables in terms of themselves, which
 * CSS treats as a cycle and drops.
 */
export type FontScale = "smaller" | "small" | "default" | "large" | "larger";

export const FONT_SCALES: ReadonlyArray<{ key: FontScale; label: string; scale: number }> = [
  { key: "smaller", label: "Smaller", scale: 0.85 },
  { key: "small", label: "Small", scale: 0.92 },
  { key: "default", label: "Default", scale: 1 },
  { key: "large", label: "Large", scale: 1.12 },
  { key: "larger", label: "Larger", scale: 1.25 },
];

export const DEFAULT_FONT_SCALE: FontScale = "default";

/** The multiplier for a scale. */
export function fontScaleValue(scale: FontScale): number {
  return FONT_SCALES.find((f) => f.key === scale)?.scale ?? 1;
}

/** The `<body>` property carrying the text size down to `.marktodo-theme`. */
export function fontProperties(scale: FontScale): Record<string, string> {
  return { "--mt-font-scale": String(fontScaleValue(scale)) };
}

/** A stored text size, with anything unknown replaced by the default. */
export function parseFontScale(raw: unknown): FontScale {
  return FONT_SCALES.some((f) => f.key === raw) ? (raw as FontScale) : DEFAULT_FONT_SCALE;
}

// ────────────────────────────────────────────────────────────────────────────
// The theme
// ────────────────────────────────────────────────────────────────────────────

export interface ThemeColors {
  /** The accent, readable on this background. */
  primary: string;
  /** The accent a step toward the text color: hover on accent buttons and links. */
  primaryHover: string;
  /** The accent as a wash: selected rows, active chips. */
  primaryLight: string;
  /** Text drawn ON the accent. */
  onAccent: string;
  /** The six statuses, fixed. */
  backlog: string;
  warming: string;
  doing: string;
  blocked: string;
  paused: string;
  done: string;
  chipDueToday: string;
  chipDueTodayText: string;
  chipOverdue: string;
  chipOverdueText: string;
  chipUpcoming: string;
  chipUpcomingText: string;
}

export interface Theme {
  dark: boolean;
  accent: AccentHsl;
  colors: ThemeColors;
}

/** Move lightness `l` toward `direction` until `color(l)` reaches `min` contrast against `bg`. */
function nudge(l: number, direction: 1 | -1, min: number, bg: string, color: (l: number) => string): number {
  let ll = l;
  while (contrast(color(ll), bg) < min && ll > 2 && ll < 98) ll += direction;
  return ll;
}

const cache = new Map<string, Theme>();

/**
 * The theme for a mode, an accent and the background it will be read against.
 *
 * `background` is Obsidian's resolved `--background-primary`: the chips composite
 * their tint over it and then nudge their text to 4.5:1 on the result, so a chip
 * stays legible on a paper-white theme and a true-black one alike. It is passed
 * in rather than assumed because the plugin no longer decides what it is.
 */
export function buildTheme(dark: boolean, accent: AccentHsl, background: string): Theme {
  const key = `${dark ? "d" : "l"}:${accent.h}:${accent.s}:${accent.l}:${background}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const accentAt = (l: number): string => hsl(accent.h, accent.s, l);
  // Keep the chosen accent when it already reads; step it toward the background
  // until it does. 3:1 is the floor for a UI color that is not body text.
  const primaryL = dark
    ? nudge(accent.l, 1, 3, background, accentAt)
    : nudge(Math.min(accent.l, 56), -1, 3.2, background, accentAt);
  const primary = accentAt(primaryL);

  const tintAlpha = dark ? 0.18 : 0.13;
  /** A chip = the hue's tint behind the hue as small text, nudged to 4.5:1 on the tint. */
  const chipPair = (hex: string): [string, string] => {
    const { h, s, l } = toHsl(hex);
    const bgChip = withAlpha(hex, tintAlpha);
    const onChip = composite(bgChip, background);
    const at = (x: number): string => hsl(h, s, x);
    return [bgChip, at(nudge(l, dark ? 1 : -1, 4.5, onChip, at))];
  };
  const [chipDueToday, chipDueTodayText] = chipPair(step(CHIP_HUES.today, dark));
  const [chipOverdue, chipOverdueText] = chipPair(step(CHIP_HUES.overdue, dark));
  const [chipUpcoming, chipUpcomingText] = chipPair(step(CHIP_HUES.upcoming, dark));

  const theme: Theme = {
    dark,
    accent,
    colors: {
      primary,
      primaryHover: accentAt(primaryL + (dark ? 6 : -6)),
      primaryLight: withAlpha(primary, tintAlpha),
      onAccent: contrast("#FFFFFF", primary) >= 3 ? "#FFFFFF" : hsl(accent.h, 40, 10),
      backlog: step(STATUS_HUES.backlog, dark),
      warming: step(STATUS_HUES.warming, dark),
      doing: step(STATUS_HUES.doing, dark),
      blocked: step(STATUS_HUES.blocked, dark),
      paused: step(STATUS_HUES.paused, dark),
      done: step(STATUS_HUES.done, dark),
      chipDueToday,
      chipDueTodayText,
      chipOverdue,
      chipOverdueText,
      chipUpcoming,
      chipUpcomingText,
    },
  };
  cache.set(key, theme);
  return theme;
}

/**
 * The status colors, as the `--marktodo-*` variables every glyph, section bar
 * and note checkbox reads. Set on `<body>`, NOT carried: a managed checkbox is
 * drawn in the note, outside any MarkTodo pane.
 */
export function statusVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    "--marktodo-backlog": c.backlog,
    "--marktodo-warming": c.warming,
    "--marktodo-progress": c.doing,
    "--marktodo-blocked": c.blocked,
    "--marktodo-paused": c.paused,
    "--marktodo-done": c.done,
  };
}

/**
 * Everything a `.marktodo-theme` element redefines — Obsidian's own variable
 * names wherever one exists, so a stock dropdown or button inside a MarkTodo
 * pane takes the accent with it.
 *
 * SHORT ON PURPOSE. Every background, text and border variable this used to
 * restate now comes from your Obsidian theme; what is left is the accent, and
 * the chips, which have no Obsidian variable to inherit.
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    "--interactive-accent": c.primary,
    "--interactive-accent-hover": c.primaryHover,
    "--interactive-accent-hsl": `${theme.accent.h}, ${theme.accent.s}%, ${theme.accent.l}%`,
    "--accent-h": String(theme.accent.h),
    "--accent-s": `${theme.accent.s}%`,
    "--accent-l": `${theme.accent.l}%`,
    "--color-accent": c.primary,
    "--color-accent-1": c.primaryHover,
    "--color-accent-2": c.primary,
    "--text-accent": c.primary,
    "--text-accent-hover": c.primaryHover,
    "--text-on-accent": c.onAccent,
    "--text-selection": withAlpha(c.primary, 0.25),
    "--link-color": c.primary,
    "--link-color-hover": c.primaryHover,
    "--tag-color": c.primary,
    "--tag-color-hover": c.primaryHover,
    "--checkbox-color": c.primary,
    "--checkbox-color-hover": c.primaryHover,
    "--icon-color-active": c.primary,
    "--background-modifier-border-focus": c.primary,
    "--background-modifier-active-hover": c.primaryLight,
    "--nav-item-background-active": c.primaryLight,

    "--mt-primary-light": c.primaryLight,
    "--mt-chip-today": c.chipDueToday,
    "--mt-chip-today-text": c.chipDueTodayText,
    "--mt-chip-overdue": c.chipOverdue,
    "--mt-chip-overdue-text": c.chipOverdueText,
    "--mt-chip-upcoming": c.chipUpcoming,
    "--mt-chip-upcoming-text": c.chipUpcomingText,
  };
}

/** The `<body>` name carrying a theme variable down to `.marktodo-theme`. */
export function themeCarrier(name: string): string {
  return `--mtt-${name.replace(/^--/, "")}`;
}

/**
 * The custom properties to set on `<body>`. `obsidianAccent`, `obsidianDark` and
 * `background` are read from the page by the caller — Obsidian's accent (for
 * "Match Obsidian"), its light/dark, and the background the chips are read on.
 */
export function themeProperties(
  appearance: Appearance,
  obsidianAccent: AccentHsl,
  obsidianDark: boolean,
  background: string,
): Record<string, string> {
  const accent =
    appearance.accent === "obsidian" ? obsidianAccent : toHsl(step(appearance.accent, obsidianDark));
  const theme = buildTheme(obsidianDark, accent, background);
  const props: Record<string, string> = { ...statusVariables(theme) };
  for (const [name, value] of Object.entries(themeVariables(theme))) props[themeCarrier(name)] = value;
  return props;
}

/**
 * The pre-Flexoki accent names, each to its nearest Flexoki hue. Kept so an
 * upgrade doesn't silently reset a choice someone made; `amber` and `rose` are
 * simply what those hues are called in this palette, and `graphite` is `base`.
 * The dropped `style` and `mode` need no migration: there is nothing to migrate
 * them TO, and your Obsidian theme now decides both.
 */
const LEGACY_ACCENTS: Record<string, FlexokiHue> = {
  amber: "yellow",
  rose: "red",
  graphite: "base",
};

/** A stored appearance, with anything unknown replaced by its default. */
export function parseAppearance(raw: unknown): Appearance {
  const r = (raw ?? {}) as Partial<Record<keyof Appearance, unknown>>;
  const stored = typeof r.accent === "string" ? (LEGACY_ACCENTS[r.accent] ?? r.accent) : r.accent;
  const allowed: readonly AccentKey[] = ["obsidian", ...(Object.keys(ACCENTS) as FlexokiHue[])];
  return { accent: allowed.includes(stored as AccentKey) ? (stored as AccentKey) : DEFAULT_APPEARANCE.accent };
}

/** Obsidian's `--accent-h/s/l` computed values → an accent (its default when unreadable). */
export function parseObsidianAccent(h: string, s: string, l: string): AccentHsl {
  const num = (v: string): number => Number.parseFloat(v);
  const out = { h: num(h), s: num(s), l: num(l) };
  return [out.h, out.s, out.l].every((v) => Number.isFinite(v)) ? out : OBSIDIAN_PURPLE;
}
