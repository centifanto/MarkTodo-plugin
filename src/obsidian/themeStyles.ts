/**
 * Puts MarkTodo's color on the page — the Obsidian half of `ui/theme.ts`, which
 * derives it. Obsidian doesn't allow plugins to add `<style>` elements, so the
 * rules live in styles.css and this sets only their values: custom properties on
 * each window's `<body>` (the main one and any pop-outs), kept in step with your
 * accent setting and with Obsidian's own accent, light/dark and background.
 *
 * Surfaces are NOT set here: the plugin follows your Obsidian theme. What lands
 * on `<body>` is the accent, the six status colors and the due chips.
 *
 * Panes and dialogs opt in by carrying `.marktodo-theme` (see `THEME_CLASS`);
 * nothing else in Obsidian is restyled.
 */
import { fontProperties, themeProperties, parseObsidianAccent } from "../ui/theme";
import { hexFromCss } from "../ui/color";
import type MarkTodoPlugin from "../../main";

export const THEME_CLASS = "marktodo-theme";

/**
 * The surface MarkTodo's chips composite onto, as an opaque `#rrggbb`.
 *
 * A custom property reads back AS AUTHORED, never resolved the way a real
 * property is: Obsidian's own mobile dark palette writes `--background-primary:
 * #000`, and a theme is free to write `rgb(...)`, `color-mix(...)` or `black`.
 * Only the browser knows them all, so the value is set on a throwaway element
 * and read back as `rgb()`. Whatever still doesn't resolve falls back to the
 * light/dark default — a theme must never be able to take the plugin down.
 */
export function themeBackground(body: HTMLElement): string {
  const raw = getComputedStyle(body).getPropertyValue("--background-primary").trim();
  return resolveColor(body, raw) ?? (body.hasClass("theme-dark") ? "#111111" : "#FFFFFF");
}

function resolveColor(body: HTMLElement, value: string): string | null {
  if (!value) return null;
  const probe = body.createSpan({ cls: "marktodo-color-probe" });
  // An invalid value is rejected right here by the CSSOM, leaving the property
  // empty — which is how a color this browser can't read is told apart from one
  // that simply resolves to black.
  probe.style.setProperty("color", value);
  const resolved = probe.style.color ? hexFromCss(getComputedStyle(probe).color) : null;
  probe.remove();
  return resolved;
}

export class ThemeStyles {
  private docs = new Set<Document>();
  /** Every property ever set, so switching to your Obsidian theme clears them all. */
  private keys = new Set<string>();
  /** What each window last got, to skip repainting when nothing changed. */
  private painted = new WeakMap<Document, string>();

  constructor(private plugin: MarkTodoPlugin) {}

  /** Start: the main window now, pop-outs as they open, and follow theme changes. */
  register(): void {
    this.attach(document);
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("window-open", (win) => this.attach(win.doc)),
    );
    // Obsidian fires this when the theme, the light/dark mode or the accent
    // changes — every input this reads from the page.
    this.plugin.registerEvent(this.plugin.app.workspace.on("css-change", () => this.refresh()));
    this.plugin.register(() => this.detachAll());
  }

  /** Repaint every window from the current settings. */
  refresh(): void {
    for (const doc of [...this.docs]) {
      if (!doc.defaultView) {
        this.docs.delete(doc); // a closed pop-out
        continue;
      }
      this.paint(doc);
    }
  }

  private attach(doc: Document): void {
    this.docs.add(doc);
    this.paint(doc);
  }

  private paint(doc: Document): void {
    const body = doc.body;
    const read = (name: string): string => getComputedStyle(body).getPropertyValue(name);
    const background = themeBackground(body);
    // Text size rides along but is NOT a color property: it is legibility, and
    // it is set the same way whatever your accent is.
    const props = {
      ...themeProperties(
        this.plugin.settings.appearance,
        parseObsidianAccent(read("--accent-h"), read("--accent-s"), read("--accent-l")),
        body.hasClass("theme-dark"),
        // The chips composite onto this and then nudge their text to 4.5:1, so
        // they stay legible on a paper-white theme and a true-black one alike.
        background,
      ),
      ...fontProperties(this.plugin.settings.fontScale),
    };

    const signature = JSON.stringify(props);
    if (this.painted.get(doc) === signature) return;
    this.painted.set(doc, signature);
    // An empty value removes a property: clear what this appearance doesn't set.
    const cleared: Record<string, string> = {};
    for (const key of this.keys) if (!(key in props)) cleared[key] = "";
    body.setCssProps({ ...cleared, ...props });
    for (const key of Object.keys(props)) this.keys.add(key);
  }

  private detachAll(): void {
    const cleared = Object.fromEntries([...this.keys].map((key) => [key, ""]));
    for (const doc of this.docs) {
      doc.body?.setCssProps(cleared);
    }
    this.docs.clear();
  }
}
