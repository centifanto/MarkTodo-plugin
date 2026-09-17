import { describe, it, expect } from "vitest";
import { generateId } from "../../src/core/id";

describe("generateId", () => {
  it("defaults to 8 chars from [A-Za-z0-9]", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });

  it("honors a custom length", () => {
    expect(generateId(12)).toHaveLength(12);
    expect(generateId(1)).toHaveLength(1);
  });

  it("is overwhelmingly likely to be unique across many draws", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateId());
    // 62^8 space — collisions in 1000 draws are astronomically unlikely
    expect(ids.size).toBe(1000);
  });
});
