import { describe, it, expect } from "vitest";
import { parseTodoLine } from "../../src/core/parse";
import { serializeTodoLine } from "../../src/core/serialize";

/** serialize ∘ parse, asserting parse succeeded. */
function reserialize(line: string): string {
  const t = parseTodoLine(line);
  expect(t, `expected a todo for: ${line}`).not.toBeNull();
  return serializeTodoLine(t!);
}

describe("round-trip identity (already-canonical lines are byte-identical)", () => {
  const canonical = [
    "- [ ] Buy milk",
    "- [x] Order tile <!-- mt id=a5 -->",
    "- [/] Demo old floor @high <!-- mt id=a2 -->",
    "- [>] Warm up <!-- mt id=b1 -->",
    "- [!] Blocked thing @urgent <!-- mt id=b2 -->",
    "- [-] Paused thing @low <!-- mt id=b3 -->",
    "  - [ ] Indented backlog",
    "* [ ] Asterisk bullet",
    "- [ ] Plain with [[Link]] and #tag and due @ 2026-07-01",
    "- [/] Mixed [[A]] #x @high due @ 2026-07-01 <!-- mt id=cc -->",
    "- [ ] @urgent priority first, where typed <!-- mt id=c2 -->",
    "- [ ] Token mid-sentence @low stays put",
    "- [?] Unknown glyph preserved <!-- mt id=dd -->",
    "- [x] Extra key preserved @high <!-- mt id=ee foo=bar -->",
    "- [ ] Unknown priority preserved <!-- mt id=ff p=critical -->",
    "- [ ] Not tokens: bob@high.com @high-school @lowkey",
  ];

  for (const line of canonical) {
    it(`is identical for: ${line}`, () => {
      expect(reserialize(line)).toBe(line);
    });
  }
});

describe("legacy capsule priority migrates inline once", () => {
  const legacy: Array<[string, string]> = [
    ["- [/] Demo old floor <!-- mt id=a2 p=high -->", "- [/] Demo old floor @high <!-- mt id=a2 -->"],
    [
      "- [/] Mixed [[A]] #x due @ 2026-07-01 <!-- mt id=cc p=high -->",
      "- [/] Mixed [[A]] #x @high due @ 2026-07-01 <!-- mt id=cc -->",
    ],
    ["- [x] Extra <!-- mt id=ee p=low foo=bar -->", "- [x] Extra @low <!-- mt id=ee foo=bar -->"],
    // An inline token outranks a stale capsule value; the capsule value is dropped.
    ["- [ ] Both @urgent <!-- mt id=gg p=low -->", "- [ ] Both @urgent <!-- mt id=gg -->"],
  ];

  for (const [input, migrated] of legacy) {
    it(`migrates then is stable: ${input}`, () => {
      expect(reserialize(input)).toBe(migrated);
      expect(reserialize(migrated)).toBe(migrated);
    });
  }
});

describe("idempotency (non-canonical input normalizes once, then is stable)", () => {
  const messy = [
    "- [/]   Demo   <!--   mt   id=a2   p=high   -->", // extra whitespace
    "- [x]    Order    tile    <!-- mt id=a5 -->",
    "- [ ] Fix leak @PU @ph <!-- mt id=h1 -->", // aliases + case + a duplicate
  ];

  for (const line of messy) {
    it(`serialize is a fixpoint after one pass for: ${line}`, () => {
      const once = reserialize(line);
      const twice = reserialize(once);
      expect(twice).toBe(once);
    });
  }
});

describe("in-place guarantee (the user's inline text is never reordered)", () => {
  it("keeps links/tags/dates exactly where typed", () => {
    const line = "- [ ] Email [[Carol]] re #budget before due @ 2026-08-15";
    const t = parseTodoLine(line)!;
    expect(t.displayText).toBe("Email [[Carol]] re #budget before due @ 2026-08-15");
    expect(serializeTodoLine(t)).toBe(line);
  });

  it("preserves unknown capsule keys across a full cycle", () => {
    const line = "- [x] Synced @low <!-- mt id=z9 notify=2026-09-01 src=app -->";
    expect(reserialize(line)).toBe(line);
  });

  it("leaves a mid-line capsule untouched (byte-stable, not relocated)", () => {
    const line = "- [ ] middle <!-- mt id=abc12345 --> trailing words";
    expect(reserialize(line)).toBe(line);
  });
});
