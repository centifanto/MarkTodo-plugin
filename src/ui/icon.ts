/**
 * Svelte action that paints a Lucide icon into an element via Obsidian's
 * `setIcon` (icons are render-only, never persisted). The UI layer
 * is Obsidian-specific presentation, so using `setIcon`/`Menu` here is fine — the
 * portability constraint applies to `core/`, not the Svelte components.
 */
import { setIcon } from "obsidian";
import type { Action } from "svelte/action";

export const icon: Action<HTMLElement, string> = (node, name) => {
  const render = (n: string) => {
    node.replaceChildren();
    if (n) setIcon(node, n);
  };
  render(name);
  return {
    update: (n: string) => render(n),
    destroy: () => node.replaceChildren(),
  };
};
