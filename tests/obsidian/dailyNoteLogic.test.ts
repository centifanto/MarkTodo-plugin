import { describe, it, expect } from "vitest";
import {
  applyDailyTemplate,
  dailyNotePath,
  dailyTemplatePath,
  formatMomentLike,
  type DateFormatter,
} from "../../src/obsidian/dailyNoteLogic";

/** Minimal moment-style formatter for the tokens the tests use. */
const fmt: DateFormatter = (d, f) =>
  f
    .replace("YYYY", String(d.getFullYear()))
    .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
    .replace("DD", String(d.getDate()).padStart(2, "0"))
    .replace("HH", String(d.getHours()).padStart(2, "0"))
    .replace("mm", String(d.getMinutes()).padStart(2, "0"));

const DAY = new Date(2026, 8, 13, 9, 5);

describe("formatMomentLike", () => {
  it("formats the common daily-note tokens like moment", () => {
    const d = new Date(2026, 8, 3, 14, 7, 9); // Thu 3 Sep 2026 14:07:09
    expect(formatMomentLike(d, "YYYY-MM-DD")).toBe("2026-09-03");
    expect(formatMomentLike(d, "dddd, MMMM Do YYYY")).toBe("Thursday, September 3rd 2026");
    expect(formatMomentLike(d, "ddd D MMM YY")).toBe("Thu 3 Sep 26");
    expect(formatMomentLike(d, "HH:mm:ss h A")).toBe("14:07:09 2 PM");
    expect(formatMomentLike(d, "[Week of] YYYY/M/D")).toBe("Week of 2026/9/3");
  });

  it("uses the right ordinal suffixes", () => {
    const on = (day: number) => formatMomentLike(new Date(2026, 0, day), "Do");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(on)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd",
    ]);
  });
});

describe("dailyNotePath", () => {
  it("defaults to YYYY-MM-DD in the vault root", () => {
    expect(dailyNotePath({}, DAY, fmt)).toBe("2026-09-13.md");
  });

  it("uses the configured folder and format, tolerating stray slashes", () => {
    expect(dailyNotePath({ folder: "/Journal/Daily/", format: "YYYY/MM-DD" }, DAY, fmt)).toBe(
      "Journal/Daily/2026/09-13.md",
    );
  });
});

describe("dailyTemplatePath", () => {
  it("adds .md and is null when unset", () => {
    expect(dailyTemplatePath({ template: "Templates/Daily" })).toBe("Templates/Daily.md");
    expect(dailyTemplatePath({ template: "Templates/Daily.md" })).toBe("Templates/Daily.md");
    expect(dailyTemplatePath({ template: "  " })).toBeNull();
    expect(dailyTemplatePath({})).toBeNull();
  });
});

describe("applyDailyTemplate", () => {
  it("fills title, date, time and custom formats; leaves other braces alone", () => {
    const tpl = "# {{title}}\nCreated {{date}} {{time}} ({{date:YYYY}}) {{other}}";
    expect(applyDailyTemplate(tpl, "2026-09-13", DAY, fmt)).toBe(
      "# 2026-09-13\nCreated 2026-09-13 09:05 (2026) {{other}}",
    );
  });
});
