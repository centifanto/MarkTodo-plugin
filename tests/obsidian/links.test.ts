import { describe, it, expect } from "vitest";
import { CONTACT_LINKS, SETTINGS_URI_ACTION } from "../../src/obsidian/links";
import { BRAND_ICONS, DISCORD_ICON, X_ICON, brandIconContent } from "../../src/ui/brandIcons";

describe("CONTACT_LINKS", () => {
  it("lists Discord, X and the docs, in that order", () => {
    expect(CONTACT_LINKS.map((l) => [l.id, l.name, l.url])).toEqual([
      ["discord", "Discord", "https://discord.gg/eHsN3wxHv6"],
      ["x", "X", "https://x.com/marktodoapp"],
      ["website", "Docs", "https://marktodo.com/docs"],
    ]);
  });

  it("uses the brand logos for Discord and X, and a globe for the website", () => {
    expect(CONTACT_LINKS.map((l) => l.icon)).toEqual([DISCORD_ICON, X_ICON, "globe"]);
    for (const id of [DISCORD_ICON, X_ICON]) expect(BRAND_ICONS[id]).toBeDefined();
  });
});

describe("brandIconContent", () => {
  it("fills a 24-unit path into Obsidian's 100-unit box", () => {
    expect(brandIconContent("M0 0h24v24H0z")).toBe(
      '<path d="M0 0h24v24H0z" fill="currentColor" stroke="none" transform="translate(8 8) scale(3.5)"/>',
    );
  });
});

describe("SETTINGS_URI_ACTION", () => {
  // The app builds obsidian://marktodo-settings?vault=… — keep them in step.
  it("is the action the app opens", () => {
    expect(SETTINGS_URI_ACTION).toBe("marktodo-settings");
  });
});
