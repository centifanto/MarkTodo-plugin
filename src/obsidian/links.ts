/**
 * Links in and out of MarkTodo. PURE.
 *
 * Contact: the last section of Settings, here and in the
 * app — same three links, same order, same icons: the Discord and X logos and
 * a generic globe for the website (`../ui/brandIcons`).
 *
 * Settings URI: the app's "Change in Obsidian" button opens
 * `obsidian://marktodo-settings?vault=<name>`. Obsidian switches to that vault
 * and the plugin opens its settings tab. The action name is a contract with the
 * app; renaming it breaks the button.
 */

import { DISCORD_ICON, X_ICON } from "../ui/brandIcons";

export interface ContactLink {
  id: "discord" | "x" | "website";
  name: string;
  desc: string;
  url: string;
  /** Button text in Settings. */
  action: string;
  /** Obsidian icon id: a brand logo registered in main.ts, or Lucide's globe. */
  icon: string;
}

export const CONTACT_LINKS: readonly ContactLink[] = [
  {
    id: "discord",
    name: "Discord",
    desc: "Questions, ideas and bug reports — and what's coming next.",
    url: "https://discord.gg/eHsN3wxHv6",
    action: "Join",
    icon: DISCORD_ICON,
  },
  { id: "x", name: "X", desc: "@marktodoapp", url: "https://x.com/marktodoapp", action: "Follow", icon: X_ICON },
  { id: "website", name: "Docs", desc: "marktodo.com/docs", url: "https://marktodo.com/docs", action: "Open", icon: "globe" },
];

/** `obsidian://marktodo-settings` opens Settings → MarkTodo. */
export const SETTINGS_URI_ACTION = "marktodo-settings";
