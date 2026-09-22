import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composite, contrast, hexFromCss, hsl, parseHex, toHsl, withAlpha } from "../../src/ui/color";
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
  type FlexokiHue,
} from "../../src/ui/theme";
import { STATUS_ORDER } from "../../src/core/types";

/** The backgrounds a chip has to stay legible on: Obsidian's own extremes. */
const BACKGROUNDS = { dark: "#1E1E1E", black: "#000000", light: "#FFFFFF" };
const HUES = Object.keys(ACCENTS) as FlexokiHue[];
const COMBOS = HUES.flatMap((hue) =>
  (Object.entries(BACKGROUNDS) as Array<[string, string]>).map(
    ([name, bg]) => [hue, name, bg, name !== "light"] as const,
  ),
);

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
  it("round-trips a hex through HSL", () => {
    for (const hex of ["#205EA6", "#D0A215", "#9F9D96", "#FFFFFF", "#000000"]) {
      const { h, s, l } = toHsl(hex);
      expect(hsl(h, s, l)).toBe(hex);
    }
  });
  // Obsidian's own mobile dark palette writes `--background-primary: #000`, and
  // that reads back AS AUTHORED: a parser that only took six digits threw out of
  // onload, which Obsidian reports as "Failed to load plugin".
  it("takes CSS shorthand hex, not just six digits", () => {
    expect(parseHex("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseHex("#1e1e1e")).toEqual(parseHex("#1E1E1E"));
    expect(parseHex(" #fff ")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex("#0008").a).toBeCloseTo(0.53, 2);
    expect(() => parseHex("rebeccapurple")).toThrow();
  });
});

describe("a theme color, whatever the theme wrote", () => {
  it("normalizes hex of any length and the rgb() a browser hands back", () => {
    expect(hexFromCss("#000")).toBe("#000000");
    expect(hexFromCss("#1E1E1E")).toBe("#1E1E1E");
    expect(hexFromCss("rgb(30, 30, 30)")).toBe("#1E1E1E");
    expect(hexFromCss("rgb(255 255 255)")).toBe("#FFFFFF");
    expect(hexFromCss("rgba(0, 0, 0, 0.5)")).toBe("#000000"); // a surface is opaque
    expect(hexFromCss("rgb(100% 0% 0%)")).toBe("#FF0000");
  });
  it("takes the color(srgb ...) Chrome computes a color-mix() to", () => {
    expect(hexFromCss("color(srgb 0.5 0 0.5)")).toBe("#800080");
    expect(hexFromCss("color(srgb 1 1 1)")).toBe("#FFFFFF");
    expect(hexFromCss("color(display-p3 1 0 0)")).toBeNull(); // not sRGB: don't guess
  });
  it("says null rather than throwing, so a caller can fall back", () => {
    for (const value of ["", "black", "var(--nope)", "color-mix(in srgb, red, blue)", "rgb(a, b, c)"]) {
      expect(hexFromCss(value)).toBeNull();
    }
  });
});

describe("the Flexoki palette", () => {
  // https://stephango.com/flexoki — 600 for light, 400 for dark. Spot-checked
  // against the published ramps so a typo here can't quietly become the theme.
  it("carries Flexoki's own 600/400 steps", () => {
    expect(ACCENTS.blue).toMatchObject({ light: "#205EA6", dark: "#4385BE" });
    expect(ACCENTS.red).toMatchObject({ light: "#AF3029", dark: "#D14D41" });
    expect(ACCENTS.yellow).toMatchObject({ light: "#AD8301", dark: "#D0A215" });
    expect(ACCENTS.green).toMatchObject({ light: "#66800B", dark: "#879A39" });
    expect(ACCENTS.purple).toMatchObject({ light: "#5E409D", dark: "#8B7EC8" });
    expect(ACCENTS.base).toMatchObject({ light: "#6F6E69", dark: "#9F9D96" });
  });

  it("is the whole palette: every accent is a Flexoki hue", () => {
    expect(HUES.sort()).toEqual(
      ["base", "blue", "cyan", "green", "magenta", "orange", "purple", "red", "yellow"].sort(),
    );
  });
});

describe("buildTheme", () => {
  it.each(COMBOS)("%s on %s: the accent and every chip stay readable", (hue, _name, bg, dark) => {
    const { colors: c } = buildTheme(dark, toHsl(dark ? ACCENTS[hue].dark : ACCENTS[hue].light), bg);
    expect(contrast(c.primary, bg)).toBeGreaterThanOrEqual(3);
    for (const [tint, text] of [
      [c.chipDueToday, c.chipDueTodayText],
      [c.chipOverdue, c.chipOverdueText],
      [c.chipUpcoming, c.chipUpcomingText],
    ]) {
      expect(contrast(text, composite(tint, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("works for any accent, e.g. a theme's own", () => {
    const { colors } = buildTheme(true, { h: 100, s: 40, l: 50 }, BACKGROUNDS.dark);
    expect(contrast(colors.primary, BACKGROUNDS.dark)).toBeGreaterThanOrEqual(3);
  });

  it("memoizes per mode, accent and background", () => {
    const a = buildTheme(false, OBSIDIAN_PURPLE, BACKGROUNDS.light);
    expect(buildTheme(false, { ...OBSIDIAN_PURPLE }, BACKGROUNDS.light)).toBe(a);
    expect(buildTheme(false, OBSIDIAN_PURPLE, BACKGROUNDS.dark)).not.toBe(a);
  });
});

describe("the six statuses are fixed", () => {
  it("does not move with the accent — a heading means one thing in every vault", () => {
    const status = (hue: FlexokiHue): Record<string, string> =>
      statusVariables(buildTheme(true, toHsl(ACCENTS[hue].dark), BACKGROUNDS.dark));
    const baseline = status("blue");
    for (const hue of HUES) expect(status(hue)).toEqual(baseline);
  });

  it("is Flexoki, and gives Done a green nothing else uses", () => {
    const s = statusVariables(buildTheme(true, OBSIDIAN_PURPLE, BACKGROUNDS.dark));
    expect(s["--marktodo-warming"]).toBe(ACCENTS.yellow.dark);
    expect(s["--marktodo-progress"]).toBe(ACCENTS.blue.dark);
    expect(s["--marktodo-blocked"]).toBe(ACCENTS.red.dark);
    expect(s["--marktodo-paused"]).toBe(ACCENTS.purple.dark);
    expect(s["--marktodo-done"]).toBe(ACCENTS.green.dark);
    expect(s["--marktodo-backlog"]).toBe(ACCENTS.base.dark);
    expect(new Set(Object.values(s)).size).toBe(STATUS_ORDER.length);
  });

  it("takes the light step under a light Obsidian theme", () => {
    const s = statusVariables(buildTheme(false, OBSIDIAN_PURPLE, BACKGROUNDS.light));
    expect(s["--marktodo-progress"]).toBe(ACCENTS.blue.light);
  });
});

describe("variables and properties", () => {
  const theme = buildTheme(true, OBSIDIAN_PURPLE, BACKGROUNDS.dark);

  it("follows your Obsidian theme: no surface, text or border is restated", () => {
    const vars = themeVariables(theme);
    for (const name of [
      "--background-primary",
      "--background-secondary",
      "--background-modifier-border",
      "--text-normal",
      "--text-muted",
      "--text-faint",
      "--modal-background",
      "--interactive-normal",
      "color-scheme",
      "color",
    ]) {
      expect(vars[name]).toBeUndefined();
    }
  });

  it("carries the accent, so stock controls in a pane match it", () => {
    const vars = themeVariables(theme);
    for (const name of ["--interactive-accent", "--color-accent", "--text-accent", "--link-color"]) {
      expect(vars[name]).toBe(theme.colors.primary);
    }
    expect(vars["--interactive-accent-hover"]).not.toBe(theme.colors.primary);
  });

  it("is flat: no gradients or glow anywhere", () => {
    for (const dark of [true, false]) {
      const props = themeProperties({ accent: "purple" }, OBSIDIAN_PURPLE, dark, BACKGROUNDS.dark);
      expect(Object.values(props).join("\n")).not.toMatch(/gradient|glow/);
    }
  });

  it("only touches notes with status colors, never surfaces", () => {
    const props = themeProperties(DEFAULT_APPEARANCE, OBSIDIAN_PURPLE, true, BACKGROUNDS.dark);
    // Real names on <body> are the status colors alone; the rest travel as carriers.
    const direct = Object.keys(props).filter((name) => !name.startsWith("--mtt-"));
    expect(direct.sort()).toEqual(Object.keys(statusVariables(theme)).sort());
    expect(props["--background-primary"]).toBeUndefined();
    expect(props["--mtt-interactive-accent"]).toBeDefined();
  });

  it("follows Obsidian's light/dark — there is no mode of its own", () => {
    const dark = themeProperties({ accent: "blue" }, OBSIDIAN_PURPLE, true, BACKGROUNDS.dark);
    const light = themeProperties({ accent: "blue" }, OBSIDIAN_PURPLE, false, BACKGROUNDS.light);
    expect(dark["--marktodo-progress"]).toBe(ACCENTS.blue.dark);
    expect(light["--marktodo-progress"]).toBe(ACCENTS.blue.light);
  });

  it("uses Obsidian's accent only when asked to", () => {
    const own = { h: 120, s: 50, l: 50 };
    const matching = themeProperties({ accent: "obsidian" }, own, true, BACKGROUNDS.dark);
    expect(matching["--mtt-interactive-accent"]).toBe(buildTheme(true, own, BACKGROUNDS.dark).colors.primary);
    const picked = themeProperties({ accent: "blue" }, own, true, BACKGROUNDS.dark);
    expect(picked["--mtt-interactive-accent"]).toBe(
      buildTheme(true, toHsl(ACCENTS.blue.dark), BACKGROUNDS.dark).colors.primary,
    );
  });
});

describe("styles.css (no <style> elements: the rules live there)", () => {
  const css = readFileSync("styles.css", "utf8");

  it("maps every carried theme variable back inside MarkTodo panes", () => {
    const open = css.indexOf(".marktodo-theme {\n  --interactive-accent:");
    expect(open).toBeGreaterThan(-1);
    const block = css.slice(open, css.indexOf("}", open));
    const names = Object.keys(themeVariables(buildTheme(true, OBSIDIAN_PURPLE, BACKGROUNDS.dark)));
    for (const name of names) expect(block).toContain(`  ${name}: var(${themeCarrier(name)});`);
    expect(block.split(";").length - 1).toBe(names.length);
  });

  it("keeps a surface fallback for every --mt-* name, in Obsidian's own variables", () => {
    for (const name of ["--mt-screen", "--mt-drawer", "--mt-raised", "--mt-card", "--mt-hairline"]) {
      expect(css).toMatch(new RegExp(`\\${name}: var\\(--(background|text)[a-z-]*\\);`));
    }
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
  it("keeps a known accent and falls back otherwise", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ accent: "cyan" })).toEqual({ accent: "cyan" });
    expect(parseAppearance({ accent: "chartreuse" })).toEqual(DEFAULT_APPEARANCE);
  });

  it("migrates the pre-Flexoki accent names instead of resetting them", () => {
    expect(parseAppearance({ accent: "amber" })).toEqual({ accent: "yellow" });
    expect(parseAppearance({ accent: "rose" })).toEqual({ accent: "red" });
    expect(parseAppearance({ accent: "graphite" })).toEqual({ accent: "base" });
  });

  it("drops the retired style and mode, whatever they were", () => {
    expect(parseAppearance({ style: "marktodo", mode: "black", accent: "blue" })).toEqual({ accent: "blue" });
  });

  it("reads Obsidian's computed accent, or its default when unreadable", () => {
    expect(parseObsidianAccent(" 152", " 62%", "45%")).toEqual({ h: 152, s: 62, l: 45 });
    expect(parseObsidianAccent("", "", "")).toEqual(OBSIDIAN_PURPLE);
  });
});
