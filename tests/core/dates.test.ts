import { describe, it, expect } from "vitest";
import {
  canonicalDate,
  canonicalDateTokens,
  canonicalTime,
  doneAtOf,
  localIsoDate,
  localIsoStamp,
  notifyAtOf,
  setDue,
  syncDoneAt,
} from "../../src/core/dates";
import { type Todo } from "../../src/core/types";

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "x",
    glyph: " ",
    priority: "NONE",
    displayText: "Email Carol",
    indent: "",
    bullet: "-",
    due: null,
    tags: [],
    links: [],
    extraTokens: [],
    ...overrides,
  };
}

describe("setDue", () => {
  it("appends a due token when none exists", () => {
    const t = setDue(todo(), "2026-08-15");
    expect(t.displayText).toBe("Email Carol due @ 2026-08-15");
    expect(t.due).toBe("2026-08-15");
  });

  it("replaces an existing due date in place", () => {
    const t = setDue(todo({ displayText: "Email Carol due @ 2026-01-01", due: "2026-01-01" }), "2026-08-15");
    expect(t.displayText).toBe("Email Carol due @ 2026-08-15");
    expect(t.due).toBe("2026-08-15");
  });

  it("removes the due token when cleared", () => {
    const t = setDue(todo({ displayText: "Email Carol due @ 2026-08-15", due: "2026-08-15" }), null);
    expect(t.displayText).toBe("Email Carol");
    expect(t.due).toBeNull();
  });

  it("sets a due token on empty text", () => {
    const t = setDue(todo({ displayText: "" }), "2026-08-15");
    expect(t.displayText).toBe("due @ 2026-08-15");
  });

  it("leaves links and tags intact", () => {
    const t = setDue(todo({ displayText: "Call [[Bob]] #urgent" }), "2026-09-01");
    expect(t.displayText).toBe("Call [[Bob]] #urgent due @ 2026-09-01");
  });
});

describe("done @ stamp", () => {
  it("formats a local calendar date", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("formats a local stamp down to the minute", () => {
    expect(localIsoStamp(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05 23:30");
    expect(localIsoStamp(new Date(2026, 0, 5, 9, 5))).toBe("2026-01-05 09:05");
  });

  it("stamps the minute when a todo becomes DONE", () => {
    const t = syncDoneAt(todo({ glyph: "x", displayText: "Email Carol @high" }), "2026-09-13 14:07");
    expect(t.displayText).toBe("Email Carol @high done @ 2026-09-13 14:07");
    expect(doneAtOf(t)).toBe("2026-09-13 14:07");
  });

  // Every stamp written before the token carried a time is a bare date, and
  // those notes are read, not rewritten.
  it("reads a stamp that has no time, and never adds one to it", () => {
    const dated = todo({ glyph: "x", displayText: "Email Carol done @ 2026-01-02" });
    expect(doneAtOf(dated)).toBe("2026-01-02");
    expect(syncDoneAt(dated, "2026-09-13 14:07")).toBe(dated);
  });

  it("canonicalizes a hand-typed stamp", () => {
    const typed = todo({ glyph: "x", displayText: "Email Carol done @ 2026-1-2 9:05" });
    expect(doneAtOf(typed)).toBe("2026-01-02 09:05");
  });

  it("removes a timed stamp when a todo leaves DONE", () => {
    const t = syncDoneAt(
      todo({ glyph: "/", displayText: "Email Carol done @ 2026-01-02 08:30 due @ 2026-10-01" }),
      "2026-09-13 14:07",
    );
    expect(t.displayText).toBe("Email Carol due @ 2026-10-01");
  });

  it("is a no-op for an open todo without a stamp", () => {
    const open = todo({ glyph: ">" });
    expect(syncDoneAt(open, "2026-09-13 14:07")).toBe(open);
  });

  it("ignores words that merely end in done", () => {
    const open = todo({ glyph: " ", displayText: "Mark undone @ 2026-01-02" });
    expect(doneAtOf(open)).toBeNull();
    expect(syncDoneAt(open, "2026-09-13 14:07")).toBe(open);
  });

  it("stamps a bare DONE todo with no text", () => {
    expect(syncDoneAt(todo({ glyph: "x", displayText: "" }), "2026-09-13 14:07").displayText).toBe(
      "done @ 2026-09-13 14:07",
    );
  });
});

describe("typed dates without leading zeros", () => {
  it("pads dates and reminder times", () => {
    expect(canonicalDate("2026-9-4")).toBe("2026-09-04");
    expect(canonicalDate("2026-09-14")).toBe("2026-09-14");
    expect(canonicalTime("9:05")).toBe("09:05");
  });

  it("canonicalDateTokens pads due, done and notify tokens only", () => {
    expect(canonicalDateTokens("Call Bob due @ 2026-9-14")).toBe("Call Bob due @ 2026-09-14");
    expect(canonicalDateTokens("x done @ 2026-1-2 notify @ 2026-9-1 9:00")).toBe(
      "x done @ 2026-01-02 notify @ 2026-09-01 09:00",
    );
    // A time after `due @` isn't part of the token; `notify @` needs its time.
    expect(canonicalDateTokens("due @ 2026-9-1 9:00 notify @ 2026-9-1")).toBe(
      "due @ 2026-09-01 9:00 notify @ 2026-9-1",
    );
    // `undone @` is not a done stamp; other dates in the text stay as typed.
    expect(canonicalDateTokens("undone @ 2026-1-2 met 2026-1-2")).toBe("undone @ 2026-1-2 met 2026-1-2");
  });

  it("canonicalDateTokens is idempotent and leaves canonical text byte-identical", () => {
    const canonical = "Pay rent due @ 2026-09-01 notify @ 2026-08-31 09:00";
    expect(canonicalDateTokens(canonical)).toBe(canonical);
    const once = canonicalDateTokens("due @2026-9-1");
    expect(canonicalDateTokens(once)).toBe(once);
    expect(once).toBe("due @2026-09-01");
  });

  it("setDue replaces a typed date with the canonical one", () => {
    const t = setDue(todo({ displayText: "Email Carol due @ 2026-9-4", due: "2026-09-04" }), "2026-10-01");
    expect(t.displayText).toBe("Email Carol due @ 2026-10-01");
    expect(setDue(todo({ displayText: "Email Carol due @ 2026-9-4" }), null).displayText).toBe("Email Carol");
  });

  it("doneAtOf reads a typed stamp as canonical, and syncDoneAt keeps it", () => {
    const done = todo({ glyph: "x", displayText: "Email Carol done @ 2026-9-4" });
    expect(doneAtOf(done)).toBe("2026-09-04");
    expect(syncDoneAt(done, "2026-09-13 14:07")).toBe(done);
    expect(syncDoneAt({ ...done, glyph: " " }, "2026-09-13 14:07").displayText).toBe("Email Carol");
  });

  it("notifyAtOf reads a reminder, padding a hand-typed date and time", () => {
    expect(notifyAtOf(todo({ displayText: "Call the plumber notify @ 2026-9-5 9:30" }))).toBe(
      "2026-09-05 09:30",
    );
    expect(notifyAtOf(todo({ displayText: "Call the plumber" }))).toBeNull();
  });

  it("notifyAtOf needs the time — a bare date is not a reminder", () => {
    expect(notifyAtOf(todo({ displayText: "Call notify @ 2026-09-05" }))).toBeNull();
  });

  it("notifyAtOf does not mistake due or done for a reminder", () => {
    expect(notifyAtOf(todo({ displayText: "Call due @ 2026-09-05 done @ 2026-09-06" }))).toBeNull();
  });
});
