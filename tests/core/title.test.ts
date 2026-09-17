import { describe, it, expect } from "vitest";
import { editableTitle, setTitle } from "../../src/core/title";
import { parseTodoLine } from "../../src/core/parse";
import { serializeTodoLine } from "../../src/core/serialize";

const t = (line: string) => parseTodoLine(line)!;

describe("editableTitle", () => {
  it("drops managed tokens, keeps links and tags", () => {
    expect(
      editableTitle("Call [[Bob]] @high about #work due @ 2026-10-01 notify @ 2026-09-30 09:00 done @ 2026-09-14"),
    ).toBe("Call [[Bob]] about #work");
  });

  it("leaves lookalikes alone", () => {
    expect(editableTitle("mail bob@high.com, undone @ 2026-01-01")).toBe("mail bob@high.com, undone @ 2026-01-01");
  });
});

describe("setTitle", () => {
  it("replaces the title and re-attaches tokens in order", () => {
    const out = setTitle(t("- [/] Fix @urgent leak due @ 2026-10-01 <!-- mt id=abcd1234 -->"), "Fix the kitchen leak");
    expect(serializeTodoLine(out)).toBe("- [/] Fix the kitchen leak @urgent due @ 2026-10-01 <!-- mt id=abcd1234 -->");
    expect(out).toMatchObject({ priority: "URGENT", due: "2026-10-01", id: "abcd1234", glyph: "/" });
  });

  it("re-derives tags and links from the new title", () => {
    const out = setTitle(t("- [ ] Old #a <!-- mt id=x1 -->"), "New [[Note]] #b");
    expect(out.tags).toEqual(["b"]);
    expect(out.links).toEqual(["Note"]);
  });

  it("a token typed in the title replaces the old one of its kind", () => {
    const out = setTitle(t("- [ ] Call @low due @ 2026-01-01 <!-- mt id=x1 -->"), "Call mom @ph due @ 2026-02-02");
    expect(serializeTodoLine(out)).toBe("- [ ] Call mom @high due @ 2026-02-02 <!-- mt id=x1 -->");
    expect(out.priority).toBe("HIGH");
  });

  it("keeps a legacy capsule priority and unknown capsule keys", () => {
    const out = setTitle(t("- [ ] Old <!-- mt id=x1 p=high foo=bar -->"), "New");
    expect(serializeTodoLine(out)).toBe("- [ ] New @high <!-- mt id=x1 foo=bar -->");
  });

  it("is a no-op for an empty or unchanged title", () => {
    const todo = t("- [ ] Same @high <!-- mt id=x1 -->");
    expect(setTitle(todo, "   ")).toBe(todo);
    expect(setTitle(todo, " Same ")).toBe(todo);
  });

  it("flattens newlines and refuses capsule openers", () => {
    const out = setTitle(t("- [ ] Old <!-- mt id=x1 -->"), "Line one\nline two <!-- sneaky");
    expect(serializeTodoLine(out)).toBe("- [ ] Line one line two sneaky <!-- mt id=x1 -->");
  });

  it("works on an unmanaged todo (stays unmanaged)", () => {
    const out = setTitle(t("- [ ] plain"), "still plain");
    expect(serializeTodoLine(out)).toBe("- [ ] still plain");
  });
});

describe("title tokens — typed dates", () => {
  it("treats unpadded due/done/notify tokens as managed", () => {
    expect(editableTitle("Call Bob due @ 2026-9-4 notify @ 2026-9-3 9:00 done @ 2026-9-4")).toBe("Call Bob");
  });

  it("keeps an unpadded due token through a rename (padded on write)", () => {
    const next = setTitle(t("- [ ] Call Bob due @ 2026-9-4 <!-- mt id=a1 -->"), "Ring Bob");
    expect(serializeTodoLine(next)).toBe("- [ ] Ring Bob due @ 2026-09-04 <!-- mt id=a1 -->");
    expect(next.due).toBe("2026-09-04");
  });
});
