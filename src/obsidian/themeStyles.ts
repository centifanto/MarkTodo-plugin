/**
 * Puts the MarkTodo theme on the page — the Obsidian half of
 * `ui/theme.ts`, which derives the colors. Obsidian doesn't allow plugins to add
 * `<style>` elements, so the rules live in styles.css and this sets only their
 * values: custom properties on each window's `<body>` (the main one and any
 * pop-outs), kept in step with the plugin's Appearance settings and with
 * Obsidian's accent and light/dark, for the "match Obsidian" choices.
 *
 * Panes and dialogs opt in by carrying `.marktodo-theme` (see `THEME_CLASS`);
 * nothing else in Obsidian is restyled.
 */
import { fontProperties, themeProperties, parseObsidianAccent } from "../ui/theme";
import type MarkTodoPlugin from "../../main";

export const THEME_CLASS = "marktodo-theme";

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
    // changes — the three inputs "match Obsidian" reads.
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
    // Text size rides along but is NOT a theme property: it applies under your
    // Obsidian theme too, where `themeProperties` deliberately yields nothing.
    const props = {
      ...themeProperties(
        this.plugin.settings.appearance,
        parseObsidianAccent(read("--accent-h"), read("--accent-s"), read("--accent-l")),
        body.hasClass("theme-dark"),
      ),
      ...fontProperties(this.plugin.settings.fontScale),
    };
    // Lets the stylesheet tell "themed" from "your Obsidian theme": the carried
    // variables only take effect under it.
    body.toggleClass("marktodo-themed", this.plugin.settings.appearance.style === "marktodo");

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
      doc.body?.removeClass("marktodo-themed");
    }
    this.docs.clear();
  }
}
