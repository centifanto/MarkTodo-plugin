/**
 * Reading a stored Today arrangement, old shape or new. PURE.
 *
 * Until 0.0.8 the four Today segments SHARED one `{ sort, group }`; they now
 * each keep their own, so that Today can lead with status dividers while Recent
 * — every row of which is Done — stays ungrouped.
 *
 * The old value is carried onto all four segments, so a grouping you chose on
 * purpose survives. The one exception is Today's group when the stored value is
 * `"none"`: that was the old DEFAULT, indistinguishable from never having
 * touched the menu, so it yields to the new default rather than pinning every
 * existing vault to the behaviour this change exists to fix. Anyone who wants
 * it back sets it in the same menu, and it sticks.
 */
import {
  DEFAULT_ARRANGEMENTS,
  defaultArrangements,
  isTodayGroup,
  parseTodaySort,
  type SmartViewType,
  type TodayArrangement,
} from "../ui/smartViews";

const SEGMENTS: readonly SmartViewType[] = ["today", "upcoming", "reminders", "recent"];

/** One stored `{ sort, group }`, with anything unrecognized replaced by `fallback`. */
function readOne(raw: unknown, fallback: TodayArrangement): TodayArrangement {
  const v = (raw ?? {}) as { sort?: unknown; group?: unknown };
  return {
    sort: parseTodaySort(v.sort),
    group: isTodayGroup(v.group) ? v.group : fallback.group,
  };
}

/** True for the pre-0.0.9 shape: one arrangement, not a map of four. */
function isLegacyShape(raw: unknown): boolean {
  return raw != null && typeof raw === "object" && "group" in raw;
}

export function migrateArrangements(
  raw: unknown,
): Record<SmartViewType, TodayArrangement> {
  const out = defaultArrangements();
  if (raw == null || typeof raw !== "object") return out;

  if (isLegacyShape(raw)) {
    const shared = readOne(raw, DEFAULT_ARRANGEMENTS.upcoming);
    for (const segment of SEGMENTS) {
      out[segment] = { ...shared };
    }
    // Today's group: "none" was the old default, so it says nothing about what
    // the user wants. Anything else was a deliberate choice and is kept.
    if (shared.group === "none") out.today.group = DEFAULT_ARRANGEMENTS.today.group;
    return out;
  }

  const stored = raw as Record<string, unknown>;
  for (const segment of SEGMENTS) {
    if (segment in stored) out[segment] = readOne(stored[segment], DEFAULT_ARRANGEMENTS[segment]);
  }
  return out;
}
