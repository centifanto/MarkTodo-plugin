import { describe, it, expect } from "vitest";
import { formatTitle, titleSegments } from "../../src/ui/format";

describe("formatTitle", () => {
  it("drops the due token (shown as a pill elsewhere)", () => {
    expect(formatTitle("Email Carol due @ 2026-08-15")).toBe("Email Carol");
  });

  it("unwraps wikilink brackets", () => {
    expect(formatTitle("Call [[Bob]] now")).toBe("Call Bob now");
  });

  it("handles both plus extra spacing", () => {
    expect(formatTitle("Plan [[Q3]]  due @ 2026-07-01")).toBe("Plan Q3");
  });

  it("drops priority tokens (shown as an icon elsewhere)", () => {
    expect(formatTitle("Fix @urgent leak due @ 2026-10-01")).toBe("Fix leak");
    expect(formatTitle("@ph Call [[Bob]]")).toBe("Call Bob");
    expect(formatTitle("mail bob@high.com")).toBe("mail bob@high.com");
  });

  it("hides done @ and the app's notify/delete-after tokens", () => {
    expect(formatTitle("Paid rent done @ 2026-09-13")).toBe("Paid rent");
    expect(formatTitle("Call notify @ 2026-09-14 09:30 mom delete-after @ 7d")).toBe("Call mom");
    expect(formatTitle("Mark undone @ 2026-09-13")).toBe("Mark undone @ 2026-09-13");
  });

  it("leaves plain text untouched", () => {
    expect(formatTitle("Buy milk")).toBe("Buy milk");
  });

  it("keeps tags inline", () => {
    expect(formatTitle("Review #budget")).toBe("Review #budget");
  });
});

describe("formatTitle — typed dates", () => {
  it("hides unpadded due, done and notify tokens", () => {
    expect(formatTitle("Call Bob due @ 2026-9-4 notify @ 2026-9-3 9:00 done @ 2026-9-4")).toBe("Call Bob");
  });
});

describe("titleSegments — links stay links", () => {
  it("cuts a wikilink out as a note link, brackets gone", () => {
    expect(titleSegments("Call [[Bob]] now")).toEqual([
      { kind: "text", text: "Call " },
      { kind: "note", text: "Bob", target: "Bob" },
      { kind: "text", text: " now" },
    ]);
  });

  it("shows a wikilink's alias and links its target", () => {
    expect(titleSegments("See [[notes/Q3 plan|the plan]]")).toEqual([
      { kind: "text", text: "See " },
      { kind: "note", text: "the plan", target: "notes/Q3 plan" },
    ]);
  });

  it("keeps a heading anchor on the target, not in the label", () => {
    expect(titleSegments("[[Spec#Risks]]")).toEqual([
      { kind: "note", text: "Spec#Risks", target: "Spec#Risks" },
    ]);
  });

  it("reads a markdown link, external or internal by its target", () => {
    expect(titleSegments("Read [the RFC](https://example.com/rfc)")).toEqual([
      { kind: "text", text: "Read " },
      { kind: "url", text: "the RFC", target: "https://example.com/rfc" },
    ]);
    expect(titleSegments("Read [the spec](notes/Spec.md)")).toEqual([
      { kind: "text", text: "Read " },
      { kind: "note", text: "the spec", target: "notes/Spec.md" },
    ]);
  });

  it("links a bare URL and leaves trailing punctuation as text", () => {
    expect(titleSegments("Check https://example.com/a, then rest")).toEqual([
      { kind: "text", text: "Check " },
      { kind: "url", text: "https://example.com/a", target: "https://example.com/a" },
      { kind: "text", text: ", then rest" },
    ]);
  });

  it("does not let a bare URL swallow the tail of a markdown link", () => {
    expect(titleSegments("[site](https://example.com) and https://other.org")).toEqual([
      { kind: "url", text: "site", target: "https://example.com" },
      { kind: "text", text: " and " },
      { kind: "url", text: "https://other.org", target: "https://other.org" },
    ]);
  });

  it("strips the same tokens formatTitle does, and stays its source of truth", () => {
    const text = "Mail [[Bob]] @urgent due @ 2026-08-15";
    expect(titleSegments(text)).toEqual([
      { kind: "text", text: "Mail " },
      { kind: "note", text: "Bob", target: "Bob" },
    ]);
    expect(formatTitle(text)).toBe(titleSegments(text).map((s) => s.text).join(""));
  });

  it("returns one text segment for a title with no links", () => {
    expect(titleSegments("Buy milk")).toEqual([{ kind: "text", text: "Buy milk" }]);
    expect(titleSegments("")).toEqual([]);
  });
});
