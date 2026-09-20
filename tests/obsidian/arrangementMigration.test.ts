import { describe, it, expect } from "vitest";
import { migrateArrangements } from "../../src/obsidian/arrangementMigration";
import { DEFAULT_ARRANGEMENTS } from "../../src/ui/smartViews";

describe("migrateArrangements", () => {
  it("starts a fresh vault on each segment's own default", () => {
    const out = migrateArrangements(undefined);
    expect(out.today.group).toBe("status");
    expect(out.upcoming.group).toBe("none");
    expect(out.reminders.group).toBe("none");
    expect(out.recent.group).toBe("none");
    expect(out).toEqual(DEFAULT_ARRANGEMENTS);
  });

  describe("the old shared shape", () => {
    // Until 0.0.8 the four segments shared one arrangement.
    it("carries a deliberate grouping onto every segment, Today included", () => {
      const out = migrateArrangements({ sort: "priority", group: "project" });
      for (const segment of ["today", "upcoming", "reminders", "recent"] as const) {
        expect(out[segment], segment).toEqual({ sort: "priority", group: "project" });
      }
    });

    it("gives Today the new default when the stored group was the old one", () => {
      // "none" was the default, so it says nothing about what the user wanted.
      const out = migrateArrangements({ sort: "date", group: "none" });
      expect(out.today).toEqual({ sort: "date", group: "status" });
      // Every other segment keeps exactly what was stored.
      expect(out.upcoming).toEqual({ sort: "date", group: "none" });
      expect(out.recent).toEqual({ sort: "date", group: "none" });
    });

    it("keeps a stored sort even while replacing Today's group", () => {
      expect(migrateArrangements({ sort: "title", group: "none" }).today).toEqual({
        sort: "title",
        group: "status",
      });
    });
  });

  describe("the per-segment shape", () => {
    it("reads each segment back unchanged", () => {
      const stored = {
        today: { sort: "priority", group: "none" },
        upcoming: { sort: "date", group: "project" },
        reminders: { sort: "title", group: "status" },
        recent: { sort: "date", group: "priority" },
      };
      expect(migrateArrangements(stored)).toEqual(stored);
    });

    it("fills in a segment that isn't stored yet", () => {
      const out = migrateArrangements({ today: { sort: "date", group: "priority" } });
      expect(out.today.group).toBe("priority");
      expect(out.recent).toEqual(DEFAULT_ARRANGEMENTS.recent);
    });
  });

  it("replaces junk rather than trusting it", () => {
    expect(migrateArrangements("nope")).toEqual(DEFAULT_ARRANGEMENTS);
    expect(migrateArrangements({ today: { sort: "bogus", group: "bogus" } }).today).toEqual(
      DEFAULT_ARRANGEMENTS.today,
    );
    // A sort Today cannot offer (Manual is a list sort) falls back too.
    expect(migrateArrangements({ today: { sort: "manual", group: "status" } }).today.sort).toBe(
      DEFAULT_ARRANGEMENTS.today.sort,
    );
  });
});
