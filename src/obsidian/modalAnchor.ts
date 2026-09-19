/**
 * Opening a dialog OVER the thing you clicked, instead of in the middle of the
 * screen. The Obsidian half of the pure `modalAnchorLogic.ts`.
 *
 * Obsidian centres every `Modal`. That is right for a dialog about the whole
 * app and wrong for one about a single row: your eye is on the row, the dialog
 * appears somewhere else, and you have to find it again. Every MarkTodo dialog
 * that is *about* something on screen — the todo editor, the capture editor
 * behind a "+", the project-name prompt — floats over whatever opened it.
 *
 * Phones are the exception: Obsidian's full-width sheet is the right shape
 * there and there is no room to float anything.
 */
import { Platform, type Modal } from "obsidian";
import { placeOverAnchor, type Box } from "./modalAnchorLogic";

/** What a dialog can be opened from: the clicked element, or a click's pointer. */
export type ModalAnchor = Element | MouseEvent | KeyboardEvent | null | undefined;

/**
 * The anchor's on-screen box, read NOW — a write from the dialog can re-render
 * the list and detach the row, and the dialog shouldn't jump when it does. A
 * keyboard-activated menu item has no pointer, so it opens centred. Duck-typed,
 * not `instanceof`: a pop-out window's events and elements come from its own realm.
 */
export function anchorBox(anchor: ModalAnchor): Box | null {
  if (!anchor) return null;
  if (!("getBoundingClientRect" in anchor)) {
    // No pointer: a keyboard event, or a synthetic / keyboard "click" (detail 0).
    if (!("clientX" in anchor) || anchor.detail === 0) return null;
    return { left: anchor.clientX, top: anchor.clientY, width: 0, height: 0 };
  }
  const { left, top, width, height } = anchor.getBoundingClientRect();
  return { left, top, width, height };
}

/**
 * Float `modal` over `anchor`, inside the window. Re-placed whenever the dialog
 * changes size (a field grows, a note is typed) or the window does, so it never
 * spills off screen. Returns a teardown for the modal's `onClose`; a null anchor
 * or a phone leaves the dialog where Obsidian put it and tears down nothing.
 *
 * `alignSelector` names the element inside the dialog that should land on the
 * anchor — the todo editor lines its TITLE up with the row's title, not its own
 * top padding.
 */
export function anchorModal(modal: Modal, anchor: Box | null, alignSelector?: string): () => void {
  if (!anchor || Platform.isPhone) return () => {};
  const { modalEl, containerEl } = modal;
  modalEl.addClass("marktodo-anchored");
  const place = (): void => {
    const align = alignSelector ? modalEl.querySelector<HTMLElement>(alignSelector) : null;
    const alignY = align ? align.getBoundingClientRect().top - modalEl.getBoundingClientRect().top : 0;
    const { left, top } = placeOverAnchor(
      anchor,
      { width: modalEl.offsetWidth, height: modalEl.offsetHeight },
      { width: containerEl.clientWidth, height: containerEl.clientHeight },
      alignY,
    );
    modalEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
  };
  place();
  const observer = new ResizeObserver(place);
  observer.observe(modalEl);
  const win = containerEl.win;
  win.addEventListener("resize", place);
  return () => {
    observer.disconnect();
    win.removeEventListener("resize", place);
  };
}
