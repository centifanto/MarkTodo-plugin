/**
 * Round-trip invariants over the WHOLE line grammar, not a hand-picked list.
 *
 * `serialize/index.ts` claims idempotence for every line ("All are fixpoints"),
 * and `types.ts` promises that a non-MarkTodo checkbox is never corrupted and
 * that unknown capsule keys are never dropped. Those are universal claims;
 * `roundtrip.test.ts` covers them with ~23 concrete lines, which is the right
 * place for readable examples but cannot establish the claim itself.
 *
 * This file builds the cross-product of every axis the grammar actually varies
 * — indent × bullet × glyph × body × capsule — and asserts the invariants on
 * all of it. The bodies are deliberately adversarial: near-miss priority tokens
 * (`bob@high.com`), a capsule the user typed mid-line, non-canonical dates, a
 * `done @` that is really `undone @`, aliases in the wrong case, two priority
 * tokens, empty text.
 *
 * Every failure is collected before asserting, so a regression reports the
 * offending lines rather than only the first one.
 */

import { describe, it, expect } from "vitest";
import { parseTodoLine } from "../../src/core/parse";
import { serializeTodoLine } from "../../src/core/serialize";
import { type Todo } from "../../src/core/types";

const INDENTS = ["", "  ", "    ", "\t"];
const BULLETS = ["-", "*", "+"];
/** The six known glyphs, plus two that are not MarkTodo's and must survive verbatim. */
const GLYPHS = [" ", ">", "/", "!", "-", "x", "?", "X"];

const BODIES = [
  "",
  "Buy milk",
  "Email [[Carol]] re #budget before the call",
  "Ship it due @ 2026-07-01",
  "Ship it due @ 2026-7-1",
  "@high Fix the leak",
  "Fix the leak @ph",
  "Fix the leak @PU",
  "Ranked @low then @high",
  "Mail bob@high.com re @high-school and @lowkey",
  "middle <!-- mt id=zzzzzzzz --> trailing words",
  "Multi  spaces   kept   inside",
  "Closed done @ 2026-9-1",
  "Not a token: undone @ 2026-9-1",
  "Remind notify @ 2026-9-1 9:05",
  "notify @ 2026-9-1 with no time",
  "unicode ✅ émoji 日本語 #tag [[Link]]",
  "@urgent",
  "Trailing spaces kept out   ",
  "#tag/nested and [[A|alias]] and 2026-09-01 bare",
];

const CAPSULES = [
  "",
  " <!-- mt id=a1b2c3d4 -->",
  " <!-- mt id=a1b2c3d4 p=high -->",
  " <!-- mt id=a1b2c3d4 notify=2026-09-01 src=app -->",
  " <!-- mt p=bogus id=zz -->",
  " <!-- mt bare id=q1 -->",
];

interface Case {
  line: string;
  indent: string;
  bullet: string;
  glyph: string;
  capsule: string;
}

/** Every line the grammar can produce from the axes above. */
function everyCase(): Case[] {
  const out: Case[] = [];
  for (const indent of INDENTS) {
    for (const bullet of BULLETS) {
      for (const glyph of GLYPHS) {
        for (const body of BODIES) {
          for (const capsule of CAPSULES) {
            const head = `${indent}${bullet} [${glyph}] ${body}`.replace(/\s+$/, "");
            out.push({ line: `${head}${capsule}`, indent, bullet, glyph, capsule });
          }
        }
      }
    }
  }
  return out;
}

const CASES = everyCase();

/** serialize ∘ parse, with the parse asserted non-null. */
function pass(line: string): { todo: Todo; out: string } {
  const todo = parseTodoLine(line);
  if (todo === null) throw new Error(`not parsed as a todo: ${JSON.stringify(line)}`);
  return { todo, out: serializeTodoLine(todo) };
}

/** The `id=` of a capsule fragment, or null when it carries none. */
function capsuleId(capsule: string): string | null {
  return /\bid=([^\s>-]+)/.exec(capsule)?.[1] ?? null;
}

/** Run `check` over every case, collecting "line → what went wrong" for the failures. */
function failures(check: (c: Case) => string | null): string[] {
  const out: string[] = [];
  for (const c of CASES) {
    let detail: string | null;
    try {
      detail = check(c);
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
    if (detail !== null) out.push(`${JSON.stringify(c.line)} — ${detail}`);
  }
  // Cap the report so one systemic break stays readable in CI output.
  return out.slice(0, 20);
}

describe(`round-trip invariants across the grammar (${CASES.length} lines)`, () => {
  it("generates a corpus that is actually a corpus", () => {
    // Guards the generator itself: a typo that collapsed an axis would quietly
    // shrink every other test in this file to near-nothing.
    expect(CASES.length).toBe(
      INDENTS.length * BULLETS.length * GLYPHS.length * BODIES.length * CAPSULES.length,
    );
    expect(new Set(CASES.map((c) => c.line)).size).toBe(CASES.length);
  });

  it("every line parses as a todo", () => {
    expect(failures(({ line }) => (parseTodoLine(line) === null ? "parsed as null" : null))).toEqual([]);
  });

  it("one pass reaches a fixpoint (serialize ∘ parse is idempotent)", () => {
    expect(
      failures(({ line }) => {
        const once = pass(line).out;
        const twice = pass(once).out;
        return twice === once ? null : `once=${JSON.stringify(once)} twice=${JSON.stringify(twice)}`;
      }),
    ).toEqual([]);
  });

  it("output is always re-parseable (a write never produces a non-todo)", () => {
    expect(
      failures(({ line }) => {
        const once = pass(line).out;
        return parseTodoLine(once) === null ? `unparseable output: ${JSON.stringify(once)}` : null;
      }),
    ).toEqual([]);
  });

  it("indent, bullet and glyph survive verbatim — including glyphs that aren't ours", () => {
    expect(
      failures(({ line, indent, bullet, glyph }) => {
        const once = pass(line).out;
        const prefix = `${indent}${bullet} [${glyph}]`;
        if (!once.startsWith(prefix)) return `expected prefix ${JSON.stringify(prefix)} in ${JSON.stringify(once)}`;
        const reparsed = parseTodoLine(once);
        if (reparsed?.glyph !== glyph) return `glyph became ${JSON.stringify(reparsed?.glyph)}`;
        return null;
      }),
    ).toEqual([]);
  });

  it("an id is never lost, never invented, and never duplicated", () => {
    expect(
      failures(({ line, capsule }) => {
        const expected = capsuleId(capsule);
        const { out } = pass(line);
        const got = parseTodoLine(out)?.id ?? null;
        if (got !== expected) return `id ${JSON.stringify(expected)} became ${JSON.stringify(got)}`;
        const capsules = (line.match(/<!--\s*mt\s/g) ?? []).length;
        const after = (out.match(/<!--\s*mt\s/g) ?? []).length;
        return capsules === after ? null : `${capsules} capsule(s) in, ${after} out`;
      }),
    ).toEqual([]);
  });

  it("recognized fields are stable across a write (no tag, link, date or priority drifts)", () => {
    expect(
      failures(({ line }) => {
        const { todo, out } = pass(line);
        const after = parseTodoLine(out);
        if (after === null) return "unparseable output";
        const diffs: string[] = [];
        // Priority's *representation* may normalize (@ph → @high, a legacy
        // capsule p= moves inline); its VALUE must not move.
        if (after.priority !== todo.priority) diffs.push(`priority ${todo.priority}→${after.priority}`);
        if (after.due !== todo.due) diffs.push(`due ${todo.due}→${after.due}`);
        if (after.tags.join(",") !== todo.tags.join(",")) diffs.push(`tags [${todo.tags}]→[${after.tags}]`);
        if (after.links.join(",") !== todo.links.join(",")) diffs.push(`links [${todo.links}]→[${after.links}]`);
        if (after.extraTokens.join(" ") !== todo.extraTokens.join(" ")) {
          diffs.push(`extraTokens [${todo.extraTokens}]→[${after.extraTokens}]`);
        }
        return diffs.length === 0 ? null : diffs.join("; ");
      }),
    ).toEqual([]);
  });

  it("the user's words are never reordered or dropped", () => {
    expect(
      failures(({ line }) => {
        const { out } = pass(line);
        // Words the serializer is allowed to add (a priority token moved out of
        // a legacy capsule) or re-case (an alias); everything else must appear,
        // in order, exactly as typed.
        const words = (w: string) => w.replace(/@(urgent|high|low|pu|ph|pl)\b/gi, "").match(/\S+/g) ?? [];
        const before = words(parseTodoLine(line)?.displayText ?? "");
        const after = words(parseTodoLine(out)?.displayText ?? "");
        // Dates and times are padded in place, so compare on the canonical form.
        const pad = (xs: string[]) =>
          xs
            .map((x) =>
              x.replace(
                /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
                (_m, y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
              ),
            )
            .map((x) => x.replace(/^(\d{1,2}):(\d{2})$/, (_m, h, min) => `${String(h).padStart(2, "0")}:${min}`));
        const a = pad(before).join(" ");
        const b = pad(after).join(" ");
        return a === b ? null : `${JSON.stringify(a)} → ${JSON.stringify(b)}`;
      }),
    ).toEqual([]);
  });
});

describe("CRLF input normalizes to its LF form, then is stable", () => {
  it("a trailing \\r is dropped and changes nothing else", () => {
    const mismatches: string[] = [];
    for (const { line } of CASES) {
      const lf = pass(line).out;
      const crlf = pass(`${line}\r`).out;
      if (crlf !== lf) mismatches.push(`${JSON.stringify(line)} — LF=${JSON.stringify(lf)} CRLF=${JSON.stringify(crlf)}`);
    }
    expect(mismatches.slice(0, 20)).toEqual([]);
  });
});
