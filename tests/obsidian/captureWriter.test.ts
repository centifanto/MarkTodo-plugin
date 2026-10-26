import { describe, expect, it } from "vitest";
import { type App, TFile } from "obsidian";
import { Writer } from "../../src/obsidian/writer";
import { indexFileTodos } from "../../src/obsidian/indexLogic";
import type { MarkTodoSettings } from "../../src/obsidian/settings";

function fixture(project: boolean) {
  const file = Object.assign(new TFile(), { path: "Capture.md" });
  let text = "Existing content\r\n";
  let writes = 0;
  const app = {
    vault: {
      process: async (_file: TFile, update: (data: string) => string) => {
        text = update(text);
        writes++;
      },
    },
    metadataCache: { getFileCache: () => ({ frontmatter: { marktodo: project } }) },
  } as unknown as App;
  return {
    writer: new Writer(app, () => ({ maintainStatusHeaders: true } as MarkTodoSettings)),
    file,
    text: () => text,
    writes: () => writes,
  };
}

describe("capture with a note", () => {
  it.each([true, false])("saves title and note together and indexes them (project=%s)", async (project) => {
    const f = fixture(project);
    const line = await f.writer.captureTodo({
      title: "Call plumber", target: f.file, status: "PROGRESS",
      note: " Phone [[Alex]]\r\n\r\nAsk about the leak ",
    });
    expect(line).not.toBeNull();
    expect(f.writes()).toBe(1);
    expect(f.text()).toContain(`${line}\r\n    Phone [[Alex]]\r\n    Ask about the leak`);
    expect(f.text().replace(/\r\n/g, "")).not.toContain("\n");
    const records = indexFileTodos(f.file.path, f.text(), { projectName: project ? "Capture" : null });
    expect(records).toHaveLength(1);
    expect(records[0].note).toBe("Phone [[Alex]]\nAsk about the leak");
    expect(records[0].glyph).toBe(project ? "/" : " ");
  });

  it.each([undefined, "", "  \n "])("still captures without a note (%s)", async (note) => {
    const f = fixture(false);
    const line = await f.writer.captureTodo({ title: "Call", target: f.file, status: "BACKLOG", note });
    expect(line).not.toBeNull();
    expect(f.text()).toBe(`Existing content\r\n${line}\r\n`);
  });

  it.each(["- [ ] Hidden todo", "Details\n<!-- mt id=forged01 -->"])("rejects unsafe notes before writing (%s)", async (note) => {
    const f = fixture(true);
    expect(await f.writer.captureTodo({ title: "Call", target: f.file, status: "BACKLOG", note })).toBeNull();
    expect(f.writes()).toBe(0);
    expect(f.text()).toBe("Existing content\r\n");
  });
});
