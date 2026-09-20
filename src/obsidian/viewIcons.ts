/**
 * ONE icon for every view setting and for every value it can take, on every
 * surface. Names, not glyphs — `setIcon` turns a name into SVG at the point of
 * use, so nothing here imports Obsidian or touches the DOM.
 *
 * It lives under `obsidian/` all the same, because an Obsidian icon name means
 * nothing anywhere else: `ui/` is the layer that stays portable to the app, and
 * this is exactly the half that does not travel.
 *
 * A parallel map ON PURPOSE, rather than an `icon` field on the tables the keys
 * come from. `sorts.ts`, `focus.ts` and `smartViews.ts` are shared with the
 * companion app so an ordering cannot come to mean two different things on two
 * devices; the app draws with Lucide React components, which are nothing in
 * Obsidian's DOM, and these strings are nothing to React Native. So each
 * program keeps its own map under the SAME keys: the shared tables stay
 * portable, and one file holds the whole vocabulary to check.
 *
 * The vocabulary, so a new row lands somewhere sensible:
 *   - focus narrows, so its four icons narrow too: every layer, then what is
 *     still being written, then what is running, then the one thing you are on.
 *   - a sort or a grouping is named by WHAT it orders by — a date, a project,
 *     A-Z — never by the direction, which is the control's own arrows.
 *   - `manual` is the grip, because manual is the only sort a drag can write
 *     back; the icon is the affordance.
 *
 * Every name below is one Obsidian actually ships. It bundles an OLDER Lucide
 * than the app does, and the renames land right on the icons a sort wants: the
 * A-Z arrow is `arrow-down-az` here where the app imports `ArrowDownAZ`, which
 * converts to a name Obsidian has never heard of. A name it does not know draws
 * nothing at all — no error, no fallback, just a gap where the icon was — so
 * check a new one against `getIconIds()` before adding it.
 */
import { PROJECT_ICON } from "../ui/iconMaps";
import { type Focus } from "../ui/focus";
import { type SortKey } from "../ui/sorts";
import { type SmartViewType, type TodayGroup } from "../ui/smartViews";
// Keyed off the real union, so a new mode fails `tsc` here rather than drawing
// a blank button.
import type { BoardMode } from "./views/todoSurface";

/** The four focus segments — a narrowing lens, left to right. */
export const FOCUS_ICONS: Record<Focus, string> = {
  all: "layers",
  plan: "pen-line",
  active: "play",
  doing: "target",
};

/** Every sort in the shared registry, so a row added there fails `tsc` here. */
export const SORT_ICONS: Record<SortKey, string> = {
  manual: "grip-vertical",
  due: "calendar-clock",
  date: "calendar-days",
  priority: "arrow-down-wide-narrow",
  title: "arrow-down-az",
  // The navigator's project icon, not the app's folder — see `iconMaps.ts`.
  project: PROJECT_ICON,
};

/** Today's group-by options. */
export const GROUP_ICONS: Record<TodayGroup, string> = {
  none: "minus",
  date: "calendar-days",
  project: PROJECT_ICON,
  priority: "arrow-down-wide-narrow",
  // Deliberately none of the six `STATUS_ICONS`: this names the axis, and
  // lending one status's glyph to all six would read as a filter for it.
  status: "square-stack",
};

/**
 * The List / Kanban / Source switch. These are the names `todoSurface.ts`
 * already hands to `setIcon`, so wiring this up replaces those literals rather
 * than putting a second icon on the same button.
 */
export const LAYOUT_ICONS: Record<BoardMode, string> = {
  list: "list",
  kanban: "columns-3",
  source: "code-xml",
};

/** The Today view's four segments, each on its own date. */
export const SMART_VIEW_ICONS: Record<SmartViewType, string> = {
  today: "sun",
  upcoming: "calendar-clock",
  reminders: "bell",
  recent: "history",
};

/**
 * The SETTINGS themselves, as opposed to their values.
 *
 * Where a value has a glyph vocabulary of its own — the three layouts, the four
 * focus segments — the control shows the VALUE's icon, because the glyph is
 * what the value looks like, and that is why neither has a setting icon here.
 * Where the value is a word or a number — a sort's name, a grouping's name, a
 * count of filters — the control shows the SETTING's icon and lets the text
 * carry the value, so a button reads "Date" under an ordering glyph and never
 * leaves you working out whether a calendar meant sorted by date or grouped by
 * date.
 *
 * The per-value maps above are still the right ones INSIDE a menu, where every
 * row is a value and its neighbours are the alternatives.
 */
export const SORT_SETTING_ICON = "arrow-up-down";
export const GROUP_SETTING_ICON = "group";
/** Filters name a set, not a value, so this one icon stands whatever is set. */
export const FILTERS_ICON = "list-filter";

/** An option list from a shared table, paired with its icons for a picker. */
export function withIcons<K extends string>(
  options: ReadonlyArray<{ key: K; label: string }>,
  icons: Record<K, string>,
): ReadonlyArray<{ key: K; label: string; icon: string }> {
  return options.map((o) => ({ ...o, icon: icons[o.key] }));
}
