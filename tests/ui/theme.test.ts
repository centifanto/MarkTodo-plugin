import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composite, contrast, hsl, parseHex, withAlpha } from "../../src/ui/color";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  OBSIDIAN_PURPLE,
  buildTheme,
  parseAppearance,
  parseObsidianAccent,
  statusVariables,
  themeCarrier,
  themeProperties,
  themeVariables,
  type ResolvedMode,
} from "../../src/ui/theme";
import { STATUS_ORDER } from "../../src/core/types";

const MODES: ResolvedMode[] = ["dark", "light", "black"];
const COMBOS = MODES.flatMap((mode) => Object.entries(ACCENTS).map(([key, accent]) => [mode, key, accent] as const));

describe("color math (the app's, copied)", () => {
  it("converts Obsidian purple hsl(258 88% 66%)", () => {
    expect(hsl(258, 88, 66)).toBe("#8A5CF5");
  });
  it("writes and reads alpha, composites, and measures contrast", () => {
    expect(withAlpha("#8A5CF5", 0.5)).toBe("#8A5CF580");
    expect(parseHex("#8A5CF580").a).toBeCloseTo(0.5, 2);
    expect(composite("#FFFFFF80", "#000000")).toBe("#808080");
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("buildTheme", () => {
  it.each(COMBOS)("%s/%s: meets the app's contrast floors", (mode, _key, accent) => {
    const { colors: c } = buildTheme(mode, accent);
    const bg = c.background;
    expect(contrast(c.textPrimary, bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textSecondary, c.elevated)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textTertiary, bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.primary, bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.onAccent, c.primary)).toBeGreaterThanOrEqual(3);
    for (const s of [c.warning, c.danger, c.orange, c.paused]) expect(contrast(s, bg)).toBeGreaterThanOrEqual(3);
    for (const [fg, chip] of [
      [c.chipDueTodayText, c.chipDueToday],
      [c.chipOverdueText, c.chipOverdue],
      [c.chipUpcomingText, c.chipUpcoming],
    ]) {
      expect(contrast(fg, composite(chip, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(COMBOS)("%s/%s: Doing (accent) and Paused stay distinguishable", (mode, _key, accent) => {
    const { colors: c } = buildTheme(mode, accent);
    const p = parseHex(c.primary);
    const q = parseHex(c.paused);
    expect(Math.hypot(p.r - q.r, p.g - q.g, p.b - q.b)).toBeGreaterThan(60);
  });

  it("works for any accent, e.g. a theme's own", () => {
    const { colors } = buildTheme("dark", { h: 100, s: 40, l: 50 });
    expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(3);
  });

  it("memoizes per mode and accent", () => {
    expect(buildTheme("light", ACCENTS.green)).toBe(buildTheme("light", { ...ACCENTS.green }));
  });
});

describe("variables and properties", () => {
  const theme = buildTheme("dark", OBSIDIAN_PURPLE);

  it("redefines Obsidian's own variables, so stock controls in a pane match", () => {
    const vars = themeVariables(theme);
    for (const name of ["--background-primary", "--text-normal", "--interactive-accent", "--background-modifier-border"]) {
      expect(vars[name]).toMatch(/^#[0-9A-F]{6}/);
    }
    expect(vars["--color-red-rgb"]).toMatch(/^\d+, \d+, \d+$/);
  });

  it("sets its own text color, so forced Light inside dark Obsidian stays readable", () => {
    const light = buildTheme("light", OBSIDIAN_PURPLE);
    expect(themeVariables(light).color).toBe(light.colors.textPrimary);
  });

  it("is flat: no gradients or glow anywhere", () => {
    for (const mode of ["dark", "light", "black"] as const) {
      const props = themeProperties({ style: "marktodo", mode, accent: "purple" }, OBSIDIAN_PURPLE, true);
      expect(Object.values(props).join("\n")).not.toMatch(/gradient|glow/);
    }
    const vars = themeVariables(theme);
    expect(vars["--mt-screen"]).toBe(theme.colors.background);
    expect(vars["--interactive-accent-hover"]).not.toBe(theme.colors.primary);
  });

  it("gives statuses the app's colors", () => {
    const s = statusVariables(theme);
    expect(s["--marktodo-progress"]).toBe(theme.colors.primary);
    expect(s["--marktodo-blocked"]).toBe(theme.colors.danger);
    expect(s["--marktodo-paused"]).toBe(theme.colors.paused);
  });

  it("follows Obsidian's light/dark, or forces one", () => {
    const dark = themeProperties(DEFAULT_APPEARANCE, OBSIDIAN_PURPLE, true);
    const light = themeProperties(DEFAULT_APPEARANCE, OBSIDIAN_PURPLE, false);
    expect(dark["--mtt-background-primary"]).toBe(buildTheme("dark", OBSIDIAN_PURPLE).colors.background);
    expect(light["--mtt-background-primary"]).toBe(buildTheme("light", OBSIDIAN_PURPLE).colors.background);
    const black = { style: "marktodo", mode: "black", accent: "rose" } as const;
    expect(themeProperties(black, OBSIDIAN_PURPLE, false)["--mtt-background-primary"]).toBe("#000000");
    expect(themeProperties(black, OBSIDIAN_PURPLE, true)).toEqual(themeProperties(black, OBSIDIAN_PURPLE, false));
  });

  it("only touches notes with status colors, never surfaces", () => {
    const props = themeProperties(DEFAULT_APPEARANCE, OBSIDIAN_PURPLE, true);
    // Real names on <body> are the status colors alone; surfaces travel as carriers.
    const direct = Object.keys(props).filter((name) => !name.startsWith("--mtt-"));
    expect(direct.sort()).toEqual(Object.keys(statusVariables(theme)).sort());
    expect(props["--background-primary"]).toBeUndefined();
    expect(props["--mtt-background-primary"]).toBeDefined();
  });

  it("is empty for the Obsidian theme style", () => {
    expect(themeProperties({ ...DEFAULT_APPEARANCE, style: "obsidian" }, OBSIDIAN_PURPLE, true)).toEqual({});
  });

  it("uses Obsidian's accent only when asked to", () => {
    const own = { h: 120, s: 50, l: 50 };
    expect(themeProperties({ style: "marktodo", mode: "dark", accent: "obsidian" }, own, true)["--mtt-interactive-accent"]).toBe(
      buildTheme("dark", own).colors.primary,
    );
    expect(themeProperties({ style: "marktodo", mode: "dark", accent: "blue" }, own, true)["--mtt-interactive-accent"]).toBe(
      buildTheme("dark", ACCENTS.blue).colors.primary,
    );
  });
});

describe("styles.css (no <style> elements: the rules live there)", () => {
  const css = readFileSync("styles.css", "utf8");

  it("maps every carried theme variable back inside MarkTodo panes", () => {
    const open = css.indexOf("body.marktodo-themed .marktodo-theme {");
    expect(open).toBeGreaterThan(-1);
    const block = css.slice(open, css.indexOf("}", open));
    const names = Object.keys(themeVariables(buildTheme("dark", OBSIDIAN_PURPLE)));
    for (const name of names) expect(block).toContain(`  ${name}: var(${themeCarrier(name)});`);
    expect(block.split(";").length - 1).toBe(names.length);
  });

  it("masks each status's managed checkboxes on both surfaces", () => {
    for (const status of STATUS_ORDER) {
      const k = status.toLowerCase();
      expect(css).toContain(
        `.cm-line.marktodo-st-${k} input[type="checkbox"],\n` +
          `.markdown-rendered li.task-list-item.marktodo-st-${k} > input[type="checkbox"] {\n` +
          `  -webkit-mask-image: var(--marktodo-mask-${k});\n` +
          `  mask-image: var(--marktodo-mask-${k});\n}`,
      );
    }
  });
});

describe("stored settings", () => {
  it("falls back per field", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ style: "obsidian", mode: "sepia", accent: "rose" })).toEqual({
      style: "obsidian",
      mode: DEFAULT_APPEARANCE.mode,
      accent: "rose",
    });
  });

  it("reads Obsidian's computed accent, or its default when unreadable", () => {
    expect(parseObsidianAccent(" 152", " 62%", "45%")).toEqual({ h: 152, s: 62, l: 45 });
    expect(parseObsidianAccent("", "", "")).toEqual(OBSIDIAN_PURPLE);
  });
});
