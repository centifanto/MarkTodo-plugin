import { describe, it, expect } from "vitest";
import {
  FILTERS_ICON,
  FOCUS_ICONS,
  GROUP_ICONS,
  GROUP_SETTING_ICON,
  LAYOUT_ICONS,
  SMART_VIEW_ICONS,
  SORT_ICONS,
  SORT_SETTING_ICON,
  withIcons,
} from "../../src/obsidian/viewIcons";
import { FOCUS_SEGMENTS } from "../../src/ui/focus";
import { TODO_SORTS } from "../../src/ui/sorts";
import { SMART_VIEWS, TODAY_GROUPS } from "../../src/ui/smartViews";
import { PROJECT_ICON } from "../../src/ui/iconMaps";

/**
 * Every table a view offers choices from, beside the map that has to name them.
 * The layout switch is absent on purpose: its union lives in `todoSurface.ts`,
 * which cannot be imported without Obsidian, so `Record<BoardMode, string>`
 * carries that one and `tsc` is what enforces it.
 */
const COVERED: ReadonlyArray<[string, ReadonlyArray<{ key: string }>, Record<string, string>]> = [
  ["focus", FOCUS_SEGMENTS, FOCUS_ICONS],
  ["sort", Object.keys(TODO_SORTS).map((key) => ({ key })), SORT_ICONS],
  ["group", TODAY_GROUPS, GROUP_ICONS],
  ["Today segment", SMART_VIEWS, SMART_VIEW_ICONS],
];

const ALL_MAPS: ReadonlyArray<Record<string, string>> = [
  FOCUS_ICONS,
  SORT_ICONS,
  GROUP_ICONS,
  LAYOUT_ICONS,
  SMART_VIEW_ICONS,
];

describe("every setting's values are named", () => {
  it.each(COVERED)("%s: an icon for every key in the table, and no key that isn't", (_what, table, icons) => {
    expect(Object.keys(icons).sort()).toEqual(table.map((o) => o.key).sort());
  });

  it("names the three layouts", () => {
    expect(Object.keys(LAYOUT_ICONS).sort()).toEqual(["kanban", "list", "source"]);
  });
});

describe("the names themselves", () => {
  it("is never blank — a blank name draws nothing at all", () => {
    for (const icons of ALL_MAPS) {
      for (const [key, name] of Object.entries(icons)) {
        expect(name, key).not.toBe("");
      }
    }
    expect([SORT_SETTING_ICON, GROUP_SETTING_ICON, FILTERS_ICON]).not.toContain("");
  });

  it("is a kebab-case Lucide id, which is all setIcon takes", () => {
    for (const icons of ALL_MAPS) {
      for (const [key, name] of Object.entries(icons)) {
        expect(name, key).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    }
  });

  it("keeps the anchors the vocabulary is built on", () => {
    // Manual is the only sort a drag can write back, so it wears the grip.
    expect(SORT_ICONS.manual).toBe("grip-vertical");
    // Obsidian's Lucide predates the ArrowDownAZ rename: "arrow-down-a-z" is a
    // gap on screen, not an error, so this one is worth pinning.
    expect(SORT_ICONS.title).toBe("arrow-down-az");
    // A project reads the same here as in the navigator.
    expect(SORT_ICONS.project).toBe(PROJECT_ICON);
    expect(GROUP_ICONS.project).toBe(PROJECT_ICON);
  });
});

describe("withIcons", () => {
  it("pairs a shared table's options with their icons, in the table's order", () => {
    expect(withIcons(FOCUS_SEGMENTS, FOCUS_ICONS)).toEqual(
      FOCUS_SEGMENTS.map((s) => ({ ...s, icon: FOCUS_ICONS[s.key] })),
    );
  });

  it("leaves the option's own label alone", () => {
    const paired = withIcons(TODAY_GROUPS, GROUP_ICONS);
    expect(paired.map((o) => o.label)).toEqual(TODAY_GROUPS.map((o) => o.label));
  });
});
