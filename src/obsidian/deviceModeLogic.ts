/**
 * On a phone or tablet the plugin starts light (no todo index, no dashboard, no
 * boards) and mentions the MarkTodo app once. PURE.
 *
 * The choice is per DEVICE (Obsidian's local storage, never data.json):
 * data.json syncs, and a phone choosing Lightweight must not switch the
 * computer too.
 */

export type DeviceMode = "full" | "light";

/** Obsidian local-storage key (per vault, per device) holding the choice. */
export const DEVICE_MODE_KEY = "marktodo-device-mode";

/** The MarkTodo app on Google Play. */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.marktodo.app";

/** A stored value → a choice, or null when none was ever made. */
export function parseDeviceMode(raw: unknown): DeviceMode | null {
  return raw === "full" || raw === "light" ? raw : null;
}

/** Desktop is always full; a phone or tablet is light unless someone chose full. */
export function effectiveDeviceMode(stored: DeviceMode | null, mobile: boolean): DeviceMode {
  if (!mobile) return "full";
  return stored ?? "light";
}

/** The one-time app popup: a mobile device where nobody has chosen yet. */
export function shouldOfferApp(stored: DeviceMode | null, mobile: boolean): boolean {
  return mobile && stored === null;
}
