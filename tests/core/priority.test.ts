import { describe, it, expect } from "vitest";
import {
  hasPriorityToken,
  normalizePriorityTokens,
  priorityFromText,
  priorityToken,
  stripPriorityTokens,
  withPriority,
} from "../../src/core/priority";
import { parseTodoLine } from "../../src/core/parse";
import { PRIORITY_ORDER } from "../../src/core/types";

describe("priorityFromText", () => {
  it("reads canonical words and the quick-entry aliases, any case", () => {
    expect(priorityFromText("Fix @urgent")).toBe("URGENT");
    expect(priorityFromText("Fix @High")).toBe("HIGH");
    expect(priorityFromText("@low first")).toBe("LOW");
    expect(priorityFromText("Fix @pu")).toBe("URGENT");
    expect(priorityFromText("Fix @PH now")).toBe("HIGH");
    expect(priorityFromText("Fix @pl")).toBe("LOW");
  });

  it("takes the first token when there are several", () => {
    expect(priorityFromText("a @low b @urgent")).toBe("LOW");
  });

  it("ignores words that merely contain a token", () => {
    expect(priorityFromText("mail bob@high.com")).toBeNull();
    expect(priorityFromText("@high-school reunion")).toBeNull();
    expect(priorityFromText("@lowkey")).toBeNull();
    expect(priorityFromText("#high tag")).toBeNull();
    expect(priorityFromText("no token")).toBeNull();
  });
});

describe("parseTodoLine — inline priority", () => {
  it("recognizes the token in place without removing it from displayText", () => {
    const t = parseTodoLine("- [ ] Fix leak @urgent due @ 2026-10-01 <!-- mt id=a1 -->")!;
    expect(t.priority).toBe("URGENT");
    expect(t.displayText).toBe("Fix leak @urgent due @ 2026-10-01");
    expect(t.due).toBe("2026-10-01");
  });

  it("falls back to a legacy capsule p= value", () => {
    expect(parseTodoLine("- [ ] Old <!-- mt id=a1 p=low -->")!.priority).toBe("LOW");
  });

  it("the inline token outranks a legacy capsule value", () => {
    expect(parseTodoLine("- [ ] Both @high <!-- mt id=a1 p=low -->")!.priority).toBe("HIGH");
  });
});

describe("withPriority", () => {
  it("appends the token when absent", () => {
    expect(withPriority("Buy milk", "HIGH")).toBe("Buy milk @high");
    expect(withPriority("", "LOW")).toBe("@low");
  });

  it("inserts before a due token", () => {
    expect(withPriority("Pay rent due @ 2026-10-01 #bills", "URGENT")).toBe(
      "Pay rent @urgent due @ 2026-10-01 #bills",
    );
  });

  it("replaces the first token where it sits", () => {
    expect(withPriority("@low Pay rent", "HIGH")).toBe("@high Pay rent");
  });

  it("NONE removes every token without leaving double spaces", () => {
    expect(withPriority("A @high B @pl", "NONE")).toBe("A B");
    expect(withPriority("@urgent Pay", "NONE")).toBe("Pay");
    expect(withPriority("Plain", "NONE")).toBe("Plain");
  });

  it("is idempotent for every priority", () => {
    const samples = ["Buy milk", "@pu fix it due @ 2026-01-02", "a @High b @low", ""];
    for (const text of samples) {
      for (const p of PRIORITY_ORDER) {
        const once = withPriority(text, p);
        expect(withPriority(once, p)).toBe(once);
        expect(priorityFromText(once) ?? "NONE").toBe(p);
      }
    }
  });
});

describe("helpers", () => {
  it("priorityToken is the canonical lowercase word, null for NONE", () => {
    expect(priorityToken("URGENT")).toBe("@urgent");
    expect(priorityToken("NONE")).toBeNull();
  });

  it("normalizePriorityTokens expands aliases and lowercases, nothing else", () => {
    expect(normalizePriorityTokens("x @PU y @ph [[L]] @Low")).toBe("x @urgent y @high [[L]] @low");
  });

  it("stripPriorityTokens / hasPriorityToken", () => {
    expect(stripPriorityTokens("Fix @pu leak")).toBe("Fix leak");
    expect(hasPriorityToken("Fix @pu leak")).toBe(true);
    expect(hasPriorityToken("bob@high.com")).toBe(false);
  });
});
