import { describe, it, expect } from "vitest";
import {
  DEFAULT_MARKTODO_FOLDER,
  derivedFolders,
  normalizeFolderRoot,
  parentFolder,
  perFileMoves,
  planFolderMove,
  rootFromLegacy,
  shouldCreateFolderOnInstall,
} from "../../src/obsidian/folderLogic";

describe("normalizeFolderRoot", () => {
  it("trims slashes and spaces, collapses doubles, converts backslashes", () => {
    expect(normalizeFolderRoot("  /Work//MarkTodo/ ")).toBe("Work/MarkTodo");
    expect(normalizeFolderRoot("Work\\MarkTodo")).toBe("Work/MarkTodo");
  });

  it("blank (or just slashes) is the default", () => {
    expect(normalizeFolderRoot("")).toBe(DEFAULT_MARKTODO_FOLDER);
    expect(normalizeFolderRoot(" / ")).toBe(DEFAULT_MARKTODO_FOLDER);
  });
});

describe("derivedFolders", () => {
  it("puts Projects and Archive inside the root", () => {
    expect(derivedFolders("Work/MarkTodo")).toEqual({
      projectsFolder: "Work/MarkTodo/Projects",
      archiveFolder: "Work/MarkTodo/Archive",
    });
  });
});

describe("rootFromLegacy", () => {
  it("recovers the root from the older two-folder setting", () => {
    expect(rootFromLegacy("MarkTodo/Projects", "MarkTodo/Archive")).toBe("MarkTodo");
    expect(rootFromLegacy("Areas/Todos/Projects", "/Areas/Todos/Archive/")).toBe("Areas/Todos");
  });

  it("falls back to the default for anything else", () => {
    expect(rootFromLegacy("Projects", "Archive")).toBe(DEFAULT_MARKTODO_FOLDER);
    expect(rootFromLegacy("A/Projects", "B/Archive")).toBe(DEFAULT_MARKTODO_FOLDER);
    expect(rootFromLegacy("", "")).toBe(DEFAULT_MARKTODO_FOLDER);
    expect(rootFromLegacy(undefined, 3)).toBe(DEFAULT_MARKTODO_FOLDER);
  });
});

describe("shouldCreateFolderOnInstall", () => {
  it("only on a first install, in a vault with no projects, when missing", () => {
    expect(shouldCreateFolderOnInstall(true, 0, false)).toBe(true);
    expect(shouldCreateFolderOnInstall(false, 0, false)).toBe(false);
    expect(shouldCreateFolderOnInstall(true, 3, false)).toBe(false);
    expect(shouldCreateFolderOnInstall(true, 0, true)).toBe(false);
  });
});

describe("planFolderMove", () => {
  it("renames when the new path is free", () => {
    expect(planFolderMove("MarkTodo", "Work/MarkTodo", true, false)).toBe("rename");
  });

  it("moves note by note when something is already there", () => {
    expect(planFolderMove("MarkTodo", "Work", true, true)).toBe("per-file");
  });

  it("has nothing to move when the old folder is gone", () => {
    expect(planFolderMove("MarkTodo", "Work", false, true)).toBe("nothing");
  });

  it("refuses a folder inside itself, either way round, case-insensitively", () => {
    expect(planFolderMove("MarkTodo", "MarkTodo/Sub", true, false)).toBe("nested");
    expect(planFolderMove("Work/MarkTodo", "work", true, true)).toBe("nested");
    expect(planFolderMove("MarkTodo", "marktodo", true, true)).toBe("nested");
  });

  it("a sibling that only shares a prefix is not nested", () => {
    expect(planFolderMove("MarkTodo", "MarkTodo2", true, false)).toBe("rename");
  });
});

describe("perFileMoves", () => {
  it("moves project notes under the old root, keeping their relative paths", () => {
    expect(
      perFileMoves("MarkTodo", "Work/MT", [
        "MarkTodo/Projects/A.md",
        "MarkTodo/Archive/B.md",
        "MarkTodo/Loose place/C.md",
        "Elsewhere/D.md",
        "MarkTodo2/E.md",
      ]),
    ).toEqual([
      { from: "MarkTodo/Projects/A.md", to: "Work/MT/Projects/A.md" },
      { from: "MarkTodo/Archive/B.md", to: "Work/MT/Archive/B.md" },
      { from: "MarkTodo/Loose place/C.md", to: "Work/MT/Loose place/C.md" },
    ]);
  });
});

describe("parentFolder", () => {
  it("is the vault root for a top-level path", () => {
    expect(parentFolder("Work/MT/Projects/A.md")).toBe("Work/MT/Projects");
    expect(parentFolder("A.md")).toBe("");
  });
});
