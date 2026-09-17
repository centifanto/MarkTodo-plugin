import { describe, it, expect } from "vitest";
import { isStatusCollapsed, toggleStatusSection } from "../../src/ui/statusSections";

describe("status section collapse", () => {
  it("folds Done by default and nothing else", () => {
    expect(isStatusCollapsed("DONE", [])).toBe(true);
    expect(isStatusCollapsed("BACKLOG", [])).toBe(false);
  });

  it("remembers a flip away from the default, and a flip back", () => {
    const opened = toggleStatusSection([], "DONE");
    expect(isStatusCollapsed("DONE", opened)).toBe(false);
    const folded = toggleStatusSection(opened, "BLOCKED");
    expect(isStatusCollapsed("BLOCKED", folded)).toBe(true);
    expect(toggleStatusSection(folded, "DONE")).toEqual(["BLOCKED"]);
  });
});
