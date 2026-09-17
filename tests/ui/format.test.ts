import { describe, it, expect } from "vitest";
import { formatTitle } from "../../src/ui/format";

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
