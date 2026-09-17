import { describe, it, expect } from "vitest";
import {
  allowedStatuses,
  canSetStatus,
  placementOf,
  statusRefusal,
} from "../../src/obsidian/placement";
import { STATUS_ORDER } from "../../src/core/types";

describe("placementOf", () => {
  it("a todo with a project is a project todo", () => {
    expect(placementOf({ project: "Home Reno" })).toBe("project");
  });

  it("any todo outside a project is loose — an Inbox.md is just another note", () => {
    expect(placementOf({ project: null })).toBe("loose");
  });
});

describe("allowedStatuses / canSetStatus", () => {
  it("projects allow every status", () => {
    expect(allowedStatuses("project")).toEqual(STATUS_ORDER);
  });

  it("loose todos only check off (BACKLOG ↔ DONE)", () => {
    expect(allowedStatuses("loose")).toEqual(["BACKLOG", "DONE"]);
    expect(canSetStatus("loose", "DONE")).toBe(true);
    expect(canSetStatus("loose", "PROGRESS")).toBe(false);
  });
});

describe("statusRefusal", () => {
  it("is null when allowed", () => {
    expect(statusRefusal("loose", "BACKLOG")).toBeNull();
    expect(statusRefusal("project", "BLOCKED")).toBeNull();
  });

  it("explains the loose refusal", () => {
    expect(statusRefusal("loose", "PAUSED")).toMatch(/Loose todos can only be checked off/);
  });
});
