/**
 * Where the todo editor opens. PURE.
 *
 * The dialog's title field lands on the clicked row's top edge, centred across
 * the row, then the whole dialog is slid back inside the window (less a margin)
 * wherever it would spill.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Gap kept between the dialog and the window edge (px) — Obsidian's --size-4-3. */
export const VIEWPORT_MARGIN = 12;

/**
 * The dialog's top-left, in the same coordinates as `anchor` and `viewport`.
 * `alignY` is how far down the dialog its title field sits, so the title (not
 * the dialog's padding) covers the clicked row.
 */
export function placeOverAnchor(
  anchor: Box,
  dialog: Size,
  viewport: Size,
  alignY = 0,
  margin = VIEWPORT_MARGIN,
): { left: number; top: number } {
  return {
    left: clampInto(anchor.left + anchor.width / 2 - dialog.width / 2, dialog.width, viewport.width, margin),
    top: clampInto(anchor.top - alignY, dialog.height, viewport.height, margin),
  };
}

/** Keep a span of `size` starting at `start` inside [margin, extent - margin]; pinned to the margin when it can't fit. */
function clampInto(start: number, size: number, extent: number, margin: number): number {
  const max = extent - margin - size;
  return Math.round(Math.max(margin, Math.min(start, max)));
}
