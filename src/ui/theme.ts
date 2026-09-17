/**
 * The MarkTodo theme for the plugin's own panes. PURE.
 *
 * This is the app's derivation — every color from (mode, accent): neutrals
 * carrying a faint tint of the accent hue, status and chip colors nudged to
 * contrast floors — ported into the plugin as its OWN copy, with its own
 * settings in the plugin's data.json. Nothing here is read by the app or
 * written into a note.
 *
 * Flat: no gradients, no glow, no lit-from-the-top surfaces; the tint and the
 * status colors are the theme.
 *
 * How it reaches the screen: `themeVariables` maps a theme onto Obsidian's own
 * CSS variables (plus a few `--mt-*` ones for what Obsidian has no word for, like
 * the chips). `obsidian/themeStyles.ts` puts them on `<body>` under carrier names,
 * and styles.css scopes them to `.marktodo-theme`, the
 * class every MarkTodo pane and dialog carries — so Obsidian's controls inside
 * (dropdowns, inputs, buttons) take the theme too, and the rest of Obsidian is
 * untouched.
 */
import { composite, contrast, hsl, hueDistance, parseHex, withAlpha } from "./color";

/** "marktodo": the app's look. "obsidian": no theming — your Obsidian theme as-is. */
export type ThemeStyle = "marktodo" | "obsidian";
/** "obsidian" follows Obsidian's light/dark; the rest force one inside MarkTodo panes. */
export type ThemeMode = "obsidian" | "dark" | "light" | "black";
export type ResolvedMode = Exclude<ThemeMode, "obsidian">;
export type AccentKey = "obsidian" | "purple" | "blue" | "cyan" | "green" | "amber" | "orange" | "rose" | "graphite";

export interface Appearance {
  style: ThemeStyle;
  mode: ThemeMode;
  accent: AccentKey;
}

export const DEFAULT_APPEARANCE: Appearance = { style: "marktodo", mode: "obsidian", accent: "obsidian" };

export interface AccentHsl {
  h: number;
  s: number;
  l: number;
}

/** The app's accents (same hues). Obsidian's default accent is hsl(258 88% 66%). */
export const ACCENTS: Record<Exclude<AccentKey, "obsidian">, AccentHsl & { label: string }> = {
  purple: { label: "Purple", h: 258, s: 88, l: 66 },
  blue: { label: "Blue", h: 217, s: 91, l: 60 },
  cyan: { label: "Cyan", h: 188, s: 86, l: 45 },
  green: { label: "Green", h: 152, s: 62, l: 45 },
  amber: { label: "Amber", h: 38, s: 92, l: 50 },
  orange: { label: "Orange", h: 21, s: 90, l: 55 },
  rose: { label: "Rose", h: 347, s: 85, l: 62 },
  graphite: { label: "Graphite", h: 220, s: 10, l: 62 },
};

export const THEME_STYLES: ReadonlyArray<{ key: ThemeStyle; label: string }> = [
  { key: "marktodo", label: "MarkTodo" },
  { key: "obsidian", label: "Obsidian theme" },
];

export const THEME_MODES: ReadonlyArray<{ key: ThemeMode; label: string }> = [
  { key: "obsidian", label: "Match Obsidian" },
  { key: "dark", label: "Dark" },
  { key: "light", label: "Light" },
  { key: "black", label: "Black" },
];

export const OBSIDIAN_PURPLE: AccentHsl = { h: 258, s: 88, l: 66 };

export interface ThemeColors {
  background: string;
  surface: string;
  elevated: string;
  pressed: string;
  border: string;
  hairline: string;
  shadow: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  /** The accent a step toward the text color: hover on accent buttons, links, checkboxes. */
  primaryHover: string;
  primaryLight: string;
  onAccent: string;
  warning: string;
  danger: string;
  orange: string;
  paused: string;
  chipDueToday: string;
  chipDueTodayText: string;
  chipOverdue: string;
  chipOverdueText: string;
  chipUpcoming: string;
  chipUpcomingText: string;
}

export interface Theme {
  mode: ResolvedMode;
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

/** The app's `buildTheme`, over any accent (so "match Obsidian's accent" works). */
export function buildTheme(mode: ResolvedMode, accent: AccentHsl): Theme {
  const key = `${mode}:${accent.h}:${accent.s}:${accent.l}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { h } = accent;
  const dark = mode !== "light";
  // Neutrals borrow the accent hue; a desaturated accent (graphite) tints less.
  const tint = Math.min(1, accent.s / 60);
  const n = (s: number, l: number, alpha = 1): string => hsl(h, s * tint, l, alpha);

  const base =
    mode === "light"
      ? { bg: n(18, 95.5), surface: n(40, 99.5), elevated: n(30, 98.5), pressed: n(20, 90), border: n(14, 86) }
      : mode === "black"
        ? { bg: "#000000", surface: n(12, 7.5), elevated: n(12, 10.5), pressed: n(14, 15), border: n(10, 15) }
        : { bg: n(9, 6.5), surface: n(10, 11.5), elevated: n(10, 14.5), pressed: n(12, 19), border: n(9, 18.5) };

  const text = dark
    ? { primary: n(14, 93), secondary: n(8, 68), tertiary: n(6, 52) }
    : { primary: n(24, 11), secondary: n(10, 34), tertiary: n(7, 45) };

  // Accent: keep the requested color when it already reads; darken for light mode.
  const accentAt = (l: number): string => hsl(h, accent.s, l);
  const primaryL = dark ? nudge(accent.l, 1, 3, base.bg, accentAt) : nudge(Math.min(accent.l, 56), -1, 3.2, base.bg, accentAt);
  const primary = accentAt(primaryL);
  const onAccent = contrast("#FFFFFF", primary) >= 3 ? "#FFFFFF" : hsl(h, 40, 10);

  // Semantic hues [h, s, l], tuned per mode.
  type Hsl = [number, number, number];
  const sem: Record<"warning" | "danger" | "orange", Hsl> = dark
    ? { warning: [43, 96, 56], danger: [0, 91, 71], orange: [27, 96, 61] }
    : { warning: [32, 95, 37], danger: [0, 72, 46], orange: [21, 90, 42] };
  // PAUSED is violet unless the accent is already violet-ish — then sky, so
  // DOING (the accent) and PAUSED never look alike.
  const pausedHue = hueDistance(h, 262) < 45 ? 199 : 262;
  const pausedHsl: Hsl = dark ? [pausedHue, 92, 76] : [pausedHue, 70, 42];
  const color = ([hh, ss, ll]: Hsl): string => hsl(hh, ss, ll);

  const tintAlpha = dark ? 0.18 : 0.13;
  /** A chip = the hue's tint behind the hue as small text, nudged to 4.5:1 on the tint. */
  const chipPair = ([hh, ss, ll]: Hsl): [string, string] => {
    const bgChip = withAlpha(hsl(hh, ss, ll), tintAlpha);
    const onChip = composite(bgChip, base.bg);
    const at = (x: number): string => hsl(hh, ss, x);
    return [bgChip, at(nudge(ll, dark ? 1 : -1, 4.5, onChip, at))];
  };
  const [chipDueToday, chipDueTodayText] = chipPair(sem.warning);
  const [chipOverdue, chipOverdueText] = chipPair(sem.danger);
  const [chipUpcoming, chipUpcomingText] = chipPair([h, accent.s, primaryL]);

  const theme: Theme = {
    mode,
    dark,
    accent,
    colors: {
      background: base.bg,
      surface: base.surface,
      elevated: base.elevated,
      pressed: base.pressed,
      border: base.border,
      hairline: dark ? "#FFFFFF14" : "#0000000F",
      shadow: dark ? "#00000066" : withAlpha(hsl(h, 30, 20), 0.14),
      textPrimary: text.primary,
      textSecondary: text.secondary,
      textTertiary: text.tertiary,
      primary,
      primaryHover: accentAt(primaryL + (dark ? 6 : -6)),
      primaryLight: withAlpha(primary, tintAlpha),
      onAccent,
      warning: color(sem.warning),
      danger: color(sem.danger),
      orange: color(sem.orange),
      paused: color(pausedHsl),
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

/** `#rrggbb[aa]` → `r, g, b` (Obsidian's `--color-*-rgb` format). */
function rgbTriplet(hex: string): string {
  const { r, g, b } = parseHex(hex);
  return `${r}, ${g}, ${b}`;
}

/**
 * The status colors (the app's `statusColor`), as the `--marktodo-*` variables
 * every glyph, section bar and note checkbox reads.
 */
export function statusVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    "--marktodo-backlog": c.textSecondary,
    "--marktodo-warming": c.warning,
    "--marktodo-progress": c.primary,
    "--marktodo-blocked": c.danger,
    "--marktodo-paused": c.paused,
    "--marktodo-done": c.primary,
  };
}

/**
 * Everything a `.marktodo-theme` element redefines. Obsidian's own variable
 * names wherever one exists — that is what makes a stock dropdown inside a
 * themed pane match it — and `--mt-*` for the app's layered surfaces.
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  const hover = withAlpha(c.textPrimary, theme.dark ? 0.06 : 0.05);
  return {
    "color-scheme": theme.dark ? "dark" : "light",
    // `color` is inherited as a COMPUTED value: text that sets no color of its
    // own (a dialog title, a setting's name, a card's title) would keep the
    // color resolved on <body> — light gray when Obsidian is dark and the theme
    // forces Light. Restating it here resolves it against the theme's variables.
    color: c.textPrimary,

    "--background-primary": c.background,
    "--background-primary-alt": c.surface,
    "--background-secondary": c.surface,
    "--background-secondary-alt": c.elevated,
    "--background-modifier-hover": hover,
    "--background-modifier-active-hover": c.primaryLight,
    "--background-modifier-border": c.border,
    "--background-modifier-border-hover": c.pressed,
    "--background-modifier-border-focus": c.primary,
    "--background-modifier-form-field": c.surface,
    "--background-modifier-form-field-highlighted": c.elevated,
    "--interactive-normal": c.elevated,
    "--interactive-hover": c.pressed,
    "--interactive-accent": c.primary,
    "--interactive-accent-hover": c.primaryHover,
    "--interactive-accent-hsl": `${theme.accent.h}, ${theme.accent.s}%, ${theme.accent.l}%`,
    "--accent-h": String(theme.accent.h),
    "--accent-s": `${theme.accent.s}%`,
    "--accent-l": `${theme.accent.l}%`,
    "--color-accent": c.primary,

    "--text-normal": c.textPrimary,
    "--text-muted": c.textSecondary,
    "--text-faint": c.textTertiary,
    "--text-accent": c.primary,
    "--text-accent-hover": c.primaryHover,
    "--text-on-accent": c.onAccent,
    "--text-error": c.danger,
    "--icon-color": c.textSecondary,
    "--icon-color-hover": c.textPrimary,
    "--icon-color-active": c.primary,
    "--icon-color-focused": c.textPrimary,
    "--nav-item-color": c.textSecondary,
    "--nav-item-color-hover": c.textPrimary,
    "--nav-item-color-active": c.textPrimary,
    "--checkbox-color": c.primary,
    "--checkbox-color-hover": c.primaryHover,

    // Obsidian defines these on <body> in terms of the variables above, so they
    // resolve THERE and would keep Obsidian's colors inside a themed pane —
    // each has to be restated here, not just its source.
    "--dropdown-background": c.elevated,
    "--dropdown-background-hover": c.pressed,
    "--dropdown-icon-background": c.elevated,
    "--background-modifier-form-field-hover": c.surface,
    "--background-modifier-error": c.danger,
    "--input-placeholder-color": c.textTertiary,
    "--modal-background": c.elevated,
    "--modal-border-color": c.border,
    "--prompt-background": c.elevated,
    "--prompt-border-color": c.border,
    "--suggestion-background": c.elevated,
    "--divider-color": c.border,
    "--text-selection": withAlpha(c.primary, 0.25),
    "--checkbox-border-color": c.textTertiary,
    "--checkbox-border-color-hover": c.textSecondary,
    "--checkbox-marker-color": c.background,
    "--collapse-icon-color": c.textTertiary,
    "--nav-item-background-hover": hover,
    "--nav-item-background-active": c.primaryLight,
    "--pill-color": c.textSecondary,
    "--pill-border-color": c.border,
    "--toggle-thumb-color": "#FFFFFF",
    // More of the same kind, found forcing Light inside dark Obsidian —
    // a dialog's field labels stayed light gray.
    "--setting-item-name-color": c.textPrimary,
    "--setting-group-heading-color": c.textPrimary,
    "--setting-items-border-color": c.border,
    "--setting-items-divider-color": c.border,
    "--caret-color": c.textPrimary,
    "--pill-color-hover": c.textPrimary,
    "--pill-color-remove": c.textTertiary,
    "--pill-color-remove-hover": c.primary,
    "--input-date-separator": c.textTertiary,
    "--search-icon-color": c.textSecondary,
    "--search-clear-button-color": c.textSecondary,
    "--collapse-icon-color-collapsed": c.primary,
    "--nav-collapse-icon-color": c.textTertiary,
    "--nav-collapse-icon-color-collapsed": c.textTertiary,
    "--nav-heading-color": c.textPrimary,
    "--nav-heading-color-hover": c.textPrimary,
    "--nav-item-color-selected": c.textPrimary,
    "--tag-color": c.primary,
    "--tag-color-hover": c.primary,
    "--link-color": c.primary,
    "--divider-color-hover": c.primary,

    "--color-red": c.danger,
    "--color-red-rgb": rgbTriplet(c.danger),
    "--color-yellow": c.warning,
    "--color-yellow-rgb": rgbTriplet(c.warning),
    "--color-orange": c.orange,
    "--color-orange-rgb": rgbTriplet(c.orange),

    "--shadow-s": `0 1px 2px ${c.shadow}, 0 2px 8px ${withAlpha(c.shadow.slice(0, 7), theme.dark ? 0.25 : 0.06)}`,
    "--shadow-l": `0 8px 24px ${c.shadow}`,

    ...statusVariables(theme),

    "--mt-screen": c.background,
    "--mt-drawer": c.surface,
    "--mt-raised": withAlpha(c.surface, theme.dark ? 0.88 : 0.92),
    "--mt-hairline": c.hairline,
    "--mt-primary-light": c.primaryLight,
    // A selected row: a neutral lift, the way Notebook Navigator marks one.
    "--mt-selection": withAlpha(c.textPrimary, theme.dark ? 0.1 : 0.08),
    "--mt-card": c.elevated,
    "--mt-chip-today": c.chipDueToday,
    "--mt-chip-today-text": c.chipDueTodayText,
    "--mt-chip-overdue": c.chipOverdue,
    "--mt-chip-overdue-text": c.chipOverdueText,
    "--mt-chip-upcoming": c.chipUpcoming,
    "--mt-chip-upcoming-text": c.chipUpcomingText,
  };
}

/**
 * The `<body>` custom property that carries one theme value down to
 * `.marktodo-theme`: `--background-primary` → `--mtt-background-primary`,
 * `color` → `--mtt-color`. styles.css maps each one back onto its real name
 * inside `body.marktodo-themed .marktodo-theme`.
 */
export function themeCarrier(name: string): string {
  return `--mtt-${name.replace(/^--/, "")}`;
}

/**
 * The custom properties to set on `<body>` for an appearance. `obsidianAccent`
 * and `obsidianDark` are Obsidian's current accent and light/dark (read from the
 * page by the caller) for the "match Obsidian" choices.
 *
 * Obsidian doesn't allow plugins to add `<style>` elements, so styles.css holds
 * the rules and this supplies only the values: every theme variable under its
 * carrier name (inert until styles.css maps it inside a MarkTodo pane), and the
 * status colors under their own names — note checkboxes live OUTSIDE MarkTodo
 * panes and take only those, never the surfaces. Style "obsidian" yields
 * nothing: MarkTodo then draws with your theme's own variables.
 */
export function themeProperties(
  appearance: Appearance,
  obsidianAccent: AccentHsl,
  obsidianDark: boolean,
): Record<string, string> {
  if (appearance.style !== "marktodo") return {};
  const accent = appearance.accent === "obsidian" ? obsidianAccent : ACCENTS[appearance.accent];
  const mode: ResolvedMode = appearance.mode === "obsidian" ? (obsidianDark ? "dark" : "light") : appearance.mode;
  const theme = buildTheme(mode, accent);
  const props: Record<string, string> = { ...statusVariables(theme) };
  for (const [name, value] of Object.entries(themeVariables(theme))) props[themeCarrier(name)] = value;
  return props;
}

/** A stored appearance, with anything unknown replaced by its default. */
export function parseAppearance(raw: unknown): Appearance {
  const r = (raw ?? {}) as Partial<Record<keyof Appearance, unknown>>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    style: pick(r.style, THEME_STYLES.map((s) => s.key), DEFAULT_APPEARANCE.style),
    mode: pick(r.mode, THEME_MODES.map((m) => m.key), DEFAULT_APPEARANCE.mode),
    accent: pick(r.accent, ["obsidian", ...Object.keys(ACCENTS)] as AccentKey[], DEFAULT_APPEARANCE.accent),
  };
}

/** Obsidian's `--accent-h/s/l` computed values → an accent (its default when unreadable). */
export function parseObsidianAccent(h: string, s: string, l: string): AccentHsl {
  const num = (v: string): number => Number.parseFloat(v);
  const out = { h: num(h), s: num(s), l: num(l) };
  return [out.h, out.s, out.l].every((v) => Number.isFinite(v)) ? out : OBSIDIAN_PURPLE;
}
