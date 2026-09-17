import { describe, it, expect } from "vitest";
import { placeOverAnchor, VIEWPORT_MARGIN } from "../../src/obsidian/modalAnchorLogic";

const viewport = { width: 1200, height: 800 };
const dialog = { width: 500, height: 400 };

describe("placeOverAnchor", () => {
  it("centres the dialog across the clicked row, its title on the row's top edge", () => {
    const row = { left: 300, top: 200, width: 600, height: 28 };
    expect(placeOverAnchor(row, dialog, viewport, 16)).toEqual({ left: 350, top: 184 });
  });

  it("a row near the bottom pushes the dialog up so it stays on screen", () => {
    const row = { left: 300, top: 760, width: 600, height: 28 };
    expect(placeOverAnchor(row, dialog, viewport).top).toBe(800 - VIEWPORT_MARGIN - 400);
  });

  it("a row at the very top keeps the margin above the dialog", () => {
    const row = { left: 300, top: 4, width: 600, height: 28 };
    expect(placeOverAnchor(row, dialog, viewport, 16).top).toBe(VIEWPORT_MARGIN);
  });

  it("a narrow card at either edge slides the dialog back inside the window", () => {
    const leftCard = { left: 0, top: 200, width: 120, height: 60 };
    const rightCard = { left: 1150, top: 200, width: 50, height: 60 };
    expect(placeOverAnchor(leftCard, dialog, viewport).left).toBe(VIEWPORT_MARGIN);
    expect(placeOverAnchor(rightCard, dialog, viewport).left).toBe(1200 - VIEWPORT_MARGIN - 500);
  });

  it("a click point (zero-size anchor) centres on the point", () => {
    const point = { left: 600, top: 300, width: 0, height: 0 };
    expect(placeOverAnchor(point, dialog, viewport)).toEqual({ left: 350, top: 300 });
  });

  it("a dialog bigger than the window pins to the top-left margin", () => {
    const row = { left: 300, top: 200, width: 600, height: 28 };
    expect(placeOverAnchor(row, { width: 1300, height: 900 }, viewport)).toEqual({
      left: VIEWPORT_MARGIN,
      top: VIEWPORT_MARGIN,
    });
  });
});
