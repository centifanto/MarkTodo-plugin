import { describe, it, expect } from "vitest";
import {
  DEFAULT_COLLAPSED_STATUSES,
  AGENDA_COLLAPSED_STATUSES,
  isStatusCollapsed,
  toggleStatusSection,
} from "../../src/ui/statusSections";
import { STATUS_ORDER } from "../../src/core/types";

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

describe("Agenda's fold default", () => {
  it("opens on Doing alone", () => {
    for (const status of STATUS_ORDER) {
      expect(isStatusCollapsed(status, [], AGENDA_COLLAPSED_STATUSES), status).toBe(
        status !== "PROGRESS",
      );
    }
  });

  it("covers every status but Doing, so none is left to chance", () => {
    expect([...AGENDA_COLLAPSED_STATUSES].sort()).toEqual(
      STATUS_ORDER.filter((s) => s !== "PROGRESS")
        .slice()
        .sort(),
    );
  });

  // The flips are stored the same way whichever surface they came from, so a
  // fold survives a restart without the default having to be stored with it.
  it("remembers a flip away from ITS default, not the list default", () => {
    const openedBacklog = toggleStatusSection([], "BACKLOG");
    expect(isStatusCollapsed("BACKLOG", openedBacklog, AGENDA_COLLAPSED_STATUSES)).toBe(false);
    // Doing is open by default here, so a flip closes it.
    const closedDoing = toggleStatusSection(openedBacklog, "PROGRESS");
    expect(isStatusCollapsed("PROGRESS", closedDoing, AGENDA_COLLAPSED_STATUSES)).toBe(true);
    // The same stored flips read differently on a project list, as they should:
    // there the default is Done-only, so an opened Backlog reads as closed.
    expect(isStatusCollapsed("BACKLOG", closedDoing, DEFAULT_COLLAPSED_STATUSES)).toBe(true);
  });
});
