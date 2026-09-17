import { describe, it, expect } from "vitest";
import { projectNoteContent, safeProjectBasename,
  noteFolderPrefix,
} from "../../src/obsidian/projectScaffold";
import { STATUS_LABELS, STATUS_ORDER } from "../../src/core/types";

describe("projectNoteContent — the Create-project scaffold", () => {
  it("writes the project key frontmatter and every status heading in column order", () => {
    const out = projectNoteContent();
    expect(out.startsWith("---\nmarktodo: true\n---\n\n")).toBe(true);
    const headings = [...out.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(STATUS_ORDER.map((s) => STATUS_LABELS[s]));
  });

  it("ends with a single trailing newline", () => {
    const out = projectNoteContent();
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

describe("safeProjectBasename", () => {
  it("strips filename-hostile characters", () => {
    expect(safeProjectBasename('Home: "Reno" [2026] #1 <v2>?')).toBe("Home Reno 2026 1 v2");
  });

  it("falls back when nothing survives", () => {
    expect(safeProjectBasename("###")).toBe("New Project");
    expect(safeProjectBasename("   ")).toBe("New Project");
  });
});

// ── Default locations decide placement, never discovery ──────────────────────

describe("noteFolderPrefix", () => {
  it("makes a trailing-slash prefix from a folder", () => {
    expect(noteFolderPrefix("MarkTodo/Projects")).toBe("MarkTodo/Projects/");
  });

  it("empty means the vault root — today's behavior, kept available", () => {
    expect(noteFolderPrefix("")).toBe("");
    expect(noteFolderPrefix("   ")).toBe("");
    expect(noteFolderPrefix("/")).toBe("");
  });

  it("tolerates leading and trailing slashes", () => {
    expect(noteFolderPrefix("/MarkTodo/Archive/")).toBe("MarkTodo/Archive/");
    expect(noteFolderPrefix("Notes/")).toBe("Notes/");
  });
});
