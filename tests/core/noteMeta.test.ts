import { describe, it, expect } from "vitest";
import {
  ARCHIVED_FM_KEY,
  CLEANUP_FM_KEY,
  DEFAULT_NOTE_META,
  GROUP_FM_KEY,
  deletesOnComplete,
  isProjectFrontmatter,
  PINNED_FM_KEY,
  PROJECT_FM_KEY,
  readNoteMeta,
} from "../../src/core/noteMeta";

describe("isProjectFrontmatter", () => {
  it("accepts `marktodo` with any non-false, non-null value", () => {
    expect(PROJECT_FM_KEY).toBe("marktodo");
    expect(isProjectFrontmatter({ marktodo: true })).toBe(true);
    expect(isProjectFrontmatter({ marktodo: "yes" })).toBe(true);
  });

  it("rejects a missing key, false, null, and absent frontmatter", () => {
    expect(isProjectFrontmatter({})).toBe(false);
    expect(isProjectFrontmatter({ marktodo: false })).toBe(false);
    expect(isProjectFrontmatter({ marktodo: null })).toBe(false);
    expect(isProjectFrontmatter(undefined)).toBe(false);
  });

  it("no other key makes a project (the key is not a setting)", () => {
    expect(isProjectFrontmatter({ todos: true })).toBe(false);
    expect(isProjectFrontmatter({ project: true })).toBe(false);
  });
});

describe("readNoteMeta — defaults", () => {
  it("absent frontmatter is every default", () => {
    expect(readNoteMeta(undefined)).toEqual(DEFAULT_NOTE_META);
  });

  it("a note with no MarkTodo keys is ungrouped, keep, unarchived, unpinned", () => {
    expect(readNoteMeta({ marktodo: true, tags: ["reno"] })).toEqual({
      group: null,
      cleanup: "keep",
      archived: false,
      pinned: false,
    });
  });

  it("never shares the default object", () => {
    const a = readNoteMeta(undefined);
    a.group = "mutated";
    expect(DEFAULT_NOTE_META.group).toBeNull();
  });
});

describe("readNoteMeta — group (scalar only)", () => {
  it("reads and trims a string", () => {
    expect(readNoteMeta({ [GROUP_FM_KEY]: "  Work  " }).group).toBe("Work");
  });

  it("treats a list as ungrouped rather than guessing which entry was meant", () => {
    expect(readNoteMeta({ [GROUP_FM_KEY]: ["Work", "Clients"] }).group).toBeNull();
  });

  it("treats blank and non-scalar values as ungrouped", () => {
    expect(readNoteMeta({ [GROUP_FM_KEY]: "   " }).group).toBeNull();
    expect(readNoteMeta({ [GROUP_FM_KEY]: {} }).group).toBeNull();
    expect(readNoteMeta({ [GROUP_FM_KEY]: null }).group).toBeNull();
    expect(readNoteMeta({ [GROUP_FM_KEY]: true }).group).toBeNull();
  });

  it("accepts a YAML number — `marktodo-group: 2026` means the group '2026'", () => {
    expect(readNoteMeta({ [GROUP_FM_KEY]: 2026 }).group).toBe("2026");
  });
});

describe("readNoteMeta — cleanup (binary, delete only when said exactly)", () => {
  it("reads `delete`, case- and space-insensitively", () => {
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: "delete" }).cleanup).toBe("delete");
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: " DELETE " }).cleanup).toBe("delete");
  });

  it("keeps for `keep`, a typo, a non-string, and an absent key", () => {
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: "keep" }).cleanup).toBe("keep");
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: "delet" }).cleanup).toBe("keep");
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: "remove" }).cleanup).toBe("keep");
    expect(readNoteMeta({ [CLEANUP_FM_KEY]: true }).cleanup).toBe("keep");
    expect(readNoteMeta({}).cleanup).toBe("keep");
  });
});

describe("readNoteMeta — archived", () => {
  it("is on for true and for the obvious written-by-hand affirmatives", () => {
    expect(readNoteMeta({ [ARCHIVED_FM_KEY]: true }).archived).toBe(true);
    expect(readNoteMeta({ [ARCHIVED_FM_KEY]: "yes" }).archived).toBe(true);
    expect(readNoteMeta({ [ARCHIVED_FM_KEY]: 1 }).archived).toBe(true);
  });

  it("is off for false, null, absent, and the written-out negatives", () => {
    expect(readNoteMeta({ [ARCHIVED_FM_KEY]: false }).archived).toBe(false);
    expect(readNoteMeta({ [ARCHIVED_FM_KEY]: null }).archived).toBe(false);
    expect(readNoteMeta({}).archived).toBe(false);
    for (const v of ["false", "no", "off", "0", " "]) {
      expect(readNoteMeta({ [ARCHIVED_FM_KEY]: v }).archived).toBe(false);
    }
  });
});

describe("readNoteMeta — pinned", () => {
  it("is on for true and for the obvious written-by-hand affirmatives", () => {
    expect(PINNED_FM_KEY).toBe("marktodo-pinned");
    expect(readNoteMeta({ [PINNED_FM_KEY]: true }).pinned).toBe(true);
    expect(readNoteMeta({ [PINNED_FM_KEY]: "yes" }).pinned).toBe(true);
    expect(readNoteMeta({ [PINNED_FM_KEY]: 1 }).pinned).toBe(true);
  });

  it("is off for false, null, absent, and the written-out negatives", () => {
    expect(readNoteMeta({ [PINNED_FM_KEY]: false }).pinned).toBe(false);
    expect(readNoteMeta({ [PINNED_FM_KEY]: null }).pinned).toBe(false);
    expect(readNoteMeta({}).pinned).toBe(false);
    for (const v of ["false", "no", "off", "0", " "]) {
      expect(readNoteMeta({ [PINNED_FM_KEY]: v }).pinned).toBe(false);
    }
  });

  it("is independent of archiving — a pinned archived note is both", () => {
    const meta = readNoteMeta({ [PINNED_FM_KEY]: true, [ARCHIVED_FM_KEY]: true });
    expect(meta).toMatchObject({ pinned: true, archived: true });
  });
});

describe("deletesOnComplete", () => {
  it("is true only for a delete-policy note", () => {
    expect(deletesOnComplete(readNoteMeta({ [CLEANUP_FM_KEY]: "delete" }))).toBe(true);
    expect(deletesOnComplete(readNoteMeta({}))).toBe(false);
  });

  it("archiving outranks the policy — an archived note never deletes", () => {
    const archivedDeleter = readNoteMeta({
      [CLEANUP_FM_KEY]: "delete",
      [ARCHIVED_FM_KEY]: true,
    });
    expect(archivedDeleter.cleanup).toBe("delete");
    expect(deletesOnComplete(archivedDeleter)).toBe(false);
  });
});
