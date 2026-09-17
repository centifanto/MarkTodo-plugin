import { describe, it, expect } from "vitest";
import { fnv1a } from "../../src/obsidian/hash";

describe("fnv1a", () => {
  it("is deterministic and 8 hex chars", () => {
    const a = fnv1a("hello world");
    expect(a).toBe(fnv1a("hello world"));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("differs for different input (incl. tiny changes)", () => {
    expect(fnv1a("hello")).not.toBe(fnv1a("hellp"));
    expect(fnv1a("- [ ] a")).not.toBe(fnv1a("- [x] a"));
  });

  it("handles empty string", () => {
    expect(fnv1a("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
