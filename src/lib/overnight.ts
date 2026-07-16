/**
 * Overnight sign-out boundary helpers — ported from Tracey (mig 332 follow-up).
 *
 * The device lock signs everyone out at the household's overnight cut-off for
 * a clean slate each morning. These pure helpers express the cut-off as a
 * monotonically-increasing "day index": it ticks up by one every time the
 * cut-off passes (in household-local time). Two instants with different
 * indices have an overnight boundary between them. The client IdleLock and
 * the server-side (app) layout gate use the SAME helpers so they agree.
 *
 * No React / Node / browser-only APIs — safe to import from both a
 * "use client" component and a server component.
 */

/** Minutes-since-midnight for an "HH:MM[:SS]" cut-off string. */
export function parseCutoffMinutes(overnightAt: string): number {
  const [h, m] = overnightAt.slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * The household-local "cut-off day index" for an instant. A cut-off day runs
 * from the cut-off time on one calendar day to the cut-off time on the next,
 * so an instant whose local time is before the cut-off belongs to the
 * previous index.
 */
export function cutoffDayIndex(at: Date, timezone: string, cutoffMinutes: number): number {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at)) {
    parts[p.type] = p.value;
  }
  // Whole-day number in household-local calendar terms (UTC math on local Y/M/D).
  const dayNum = Math.floor(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000
  );
  // Intl can emit "24" for midnight in some engines — normalise to 0.
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  return dayNum - (minutes < cutoffMinutes ? 1 : 0);
}

/**
 * True if at least one overnight cut-off lies in the interval (since, now] —
 * i.e. the session established at `since` should be reset.
 */
export function overnightBoundaryCrossed(
  since: Date,
  now: Date,
  timezone: string,
  overnightAt: string
): boolean {
  const cm = parseCutoffMinutes(overnightAt);
  return cutoffDayIndex(now, timezone, cm) > cutoffDayIndex(since, timezone, cm);
}
