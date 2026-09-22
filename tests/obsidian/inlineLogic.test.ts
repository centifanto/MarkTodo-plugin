import { describe, it, expect } from "vitest";
import {
  aliasExpansionAt,
  buildCaptureLine,
  captureActions,
  captureStatus,
  findTrigger,
  lineToTodo,
  managedScaffold,
} from "../../src/obsidian/inlineLogic";

describe("findTrigger — where the keyword may fire", () => {
  it("fires at the end of plain text, a checkbox, or a blank line", () => {
    expect(findTrigger("test todo mtodo", "mtodo")).toEqual({ start: 10, query: "" });
    expect(findTrigger("- [ ] Buy milk mtodo", "mtodo")).toEqual({ start: 15, query: "" });
    expect(findTrigger("mtodo", "mtodo")).toEqual({ start: 0, query: "" });
    expect(findTrigger("  mtodo", "mtodo")).toEqual({ start: 2, query: "" });
  });

  it("a word trigger must start a word; a punctuation trigger may be glued", () => {
    expect(findTrigger("xmtodo", "mtodo")).toBeNull();
    expect(findTrigger("Buy milk;t", ";t")).toEqual({ start: 8, query: "" });
  });

  it("returns the word characters typed after the trigger as the query", () => {
    expect(findTrigger("note ;tse", ";t")).toEqual({ start: 5, query: "se" });
  });

  it("never fires on a heading", () => {
    expect(findTrigger("## Kitchen mtodo", "mtodo")).toBeNull();
  });
});

describe("lineToTodo — the trigger's line as a todo", () => {
  const tail = (raw: string, trigger = " mtodo") => lineToTodo(raw, raw.length - trigger.length, raw.length);

  it("keeps a checkbox line as itself (inline due/tags preserved)", () => {
    const r = tail("- [x] Pay rent #bills due @ 2026-07-01 mtodo")!;
    expect(r.wasTodo).toBe(true);
    expect(r.todo.glyph).toBe("x");
    expect(r.todo.displayText).toBe("Pay rent #bills due @ 2026-07-01");
  });

  it("adds a checkbox to plain text, keeping its indent", () => {
    const r = tail("  test todo mtodo")!;
    expect(r.wasTodo).toBe(false);
    expect(r).toMatchObject({ todo: { indent: "  ", bullet: "-", glyph: " ", displayText: "test todo" } });
  });

  it("adds a checkbox to a plain list item, keeping its bullet", () => {
    expect(tail("* call Bob mtodo")!.todo).toMatchObject({ bullet: "*", displayText: "call Bob" });
  });

  it("a blank line or empty checkbox yields an empty title", () => {
    expect(lineToTodo("mtodo", 0, 5)!.todo.displayText).toBe("");
    expect(tail("- [ ] mtodo")!.todo.displayText).toBe("");
  });

  it("recognizes an already-managed line", () => {
    const raw = "- [ ] Review <!-- mt id=keepme01 -->";
    expect(lineToTodo(raw, raw.length, raw.length)!.todo.id).toBe("keepme01");
  });
});

describe("captureStatus", () => {
  const t = (glyph: string) => lineToTodo(`- [${glyph}] x`, 0, 0)!.todo;

  it("project keeps a checkbox's own status, else the default", () => {
    expect(captureStatus("project", t("/"), true, "WARMING")).toBe("PROGRESS");
    expect(captureStatus("project", t(" "), false, "WARMING")).toBe("WARMING");
    expect(captureStatus("project", t("?"), true, "WARMING")).toBe("WARMING");
  });

  it("loose keeps Backlog/Done, anything else becomes Backlog", () => {
    expect(captureStatus("loose", t("x"), true, "WARMING")).toBe("DONE");
    expect(captureStatus("loose", t("/"), true, "WARMING")).toBe("BACKLOG");
    expect(captureStatus("loose", t(" "), false, "WARMING")).toBe("BACKLOG");
  });
});

describe("captureActions — popup rows, default first", () => {
  it("without a catch-all note there are two options", () => {
    expect(captureActions({ defaultAction: "editor", catchAll: false, managed: false, blank: false })).toEqual([
      "editor",
      "here",
    ]);
    // A default that isn't available falls back to canonical order.
    expect(captureActions({ defaultAction: "catchall", catchAll: false, managed: false, blank: false })).toEqual([
      "here",
      "editor",
    ]);
  });

  it("with a catch-all note, Send to it is the third option (or first when default)", () => {
    expect(captureActions({ defaultAction: "here", catchAll: true, managed: false, blank: false })).toEqual([
      "here",
      "editor",
      "catchall",
    ]);
    expect(captureActions({ defaultAction: "catchall", catchAll: true, managed: false, blank: false })).toEqual([
      "catchall",
      "here",
      "editor",
    ]);
  });

  it("a blank line can't be sent anywhere", () => {
    expect(captureActions({ defaultAction: "catchall", catchAll: true, managed: false, blank: true })).toEqual([
      "here",
      "editor",
    ]);
  });

  it("an already-managed line only offers Edit", () => {
    expect(captureActions({ defaultAction: "here", catchAll: true, managed: true, blank: false })).toEqual(["edit"]);
  });
});

describe("buildCaptureLine — the todo editor's create mode", () => {
  it("builds a managed line with status, id, and inline tokens from the title", () => {
    expect(buildCaptureLine({ title: " Fix leak @pu due @ 2026-10-01 ", status: "PROGRESS", id: "abcd1234" })).toBe(
      "- [/] Fix leak @urgent due @ 2026-10-01 <!-- mt id=abcd1234 -->",
    );
  });

  it("applies chosen priority/due over the title's", () => {
    expect(
      buildCaptureLine({ title: "Call @low", status: "BACKLOG", priority: "HIGH", due: "2026-11-02", id: "abcd1234" }),
    ).toBe("- [ ] Call @high due @ 2026-11-02 <!-- mt id=abcd1234 -->");
    expect(
      buildCaptureLine({ title: "Call due @ 2026-01-01", status: "BACKLOG", due: null, priority: "NONE", id: "abcd1234" }),
    ).toBe("- [ ] Call <!-- mt id=abcd1234 -->");
  });

  it("stamps done @ when captured straight into DONE", () => {
    expect(buildCaptureLine({ title: "Paid rent", status: "DONE", id: "abcd1234", doneAt: "2026-09-13 14:07" })).toBe(
      "- [x] Paid rent done @ 2026-09-13 14:07 <!-- mt id=abcd1234 -->",
    );
  });

  it("rejects an empty title", () => {
    expect(buildCaptureLine({ title: "   ", status: "BACKLOG", id: "abcd1234" })).toBeNull();
  });
});

describe("aliasExpansionAt — live @pu/@ph/@pl expansion", () => {
  it("expands an alias right before the cursor on a todo line", () => {
    const line = "- [ ] Fix leak @pu";
    expect(aliasExpansionAt(line, line.length)).toEqual({
      from: line.length - 3,
      to: line.length,
      insert: "@urgent",
    });
  });

  it("works mid-line before a hidden capsule, any case", () => {
    const line = "- [ ] Call @PH <!-- mt id=abcd1234 -->";
    const ch = line.indexOf(" <!--");
    expect(aliasExpansionAt(line, ch)).toEqual({ from: ch - 3, to: ch, insert: "@high" });
  });

  it("ignores non-todo lines, glued text, and non-alias words", () => {
    expect(aliasExpansionAt("Meeting notes @pl", 17)).toBeNull();
    expect(aliasExpansionAt("- [ ] email bob@pl", 18)).toBeNull();
    expect(aliasExpansionAt("- [ ] @plan", 11)).toBeNull();
    expect(aliasExpansionAt("- [ ] @high", 11)).toBeNull();
  });
});

describe("managedScaffold", () => {
  it("builds the checkbox head and an 8-char-id capsule tail for a status", () => {
    const { head, tail } = managedScaffold("BACKLOG");
    expect(head).toBe("- [ ] ");
    expect(tail).toMatch(/^ <!-- mt id=[A-Za-z0-9]{8} -->$/);
  });
});
