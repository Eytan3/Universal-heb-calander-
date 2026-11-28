/**
 * Wall-clock time in an IANA time zone ↔ absolute instants, using only Intl (no tz database of our own).
 *
 * An event at "10:00 in Asia/Jerusalem" stays at 10:00 local time on every occurrence, also across
 * daylight-saving changes; the instant (UTC) is derived per occurrence. Times that do not exist (the hour
 * skipped when clocks go forward) move forward by the gap, like Apple Calendar does.
 */
import { gregorian } from "../calendars/gregorian";
import type { EpochDay } from "./epochDay";

export type HHMM = `${number}:${number}` | string;

export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` from UTC at instant `ms`, in minutes (Jerusalem in summer → +180). */
export function offsetMinutes(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** The instant (ms since epoch) of wall-clock `hhmm` on `day` in `tz`. */
export function zonedToUtc(day: EpochDay, hhmm: string, tz: string): number {
  const g = gregorian.fromEpochDay(day);
  const wall = Date.UTC(g.year, Number(g.monthCode.slice(1)) - 1, g.day) + minutesOf(hhmm) * 60000;
  // The two offsets around the wall time give at most two candidate instants.
  const o1 = offsetMinutes(wall, tz);
  const a = wall - o1 * 60000;
  const o2 = offsetMinutes(a, tz);
  const b = wall - o2 * 60000;
  if (a === b) return a;
  const shows = (t: number) => t + offsetMinutes(t, tz) * 60000 === wall;
  const okA = shows(a), okB = shows(b);
  if (okA && okB) return Math.min(a, b); // clocks went back: the time happens twice — take the first
  if (okA) return a;
  if (okB) return b;
  return Math.max(a, b); // clocks went forward: the time does not exist — move forward by the gap
}

/** "20270304T080000Z" — iCalendar UTC date-time. */
export function icsUtcDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** The device's own time zone (falls back to Jerusalem where Intl cannot tell). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

/** Short time label in a locale, 24-hour: "09:30". */
export function formatTime(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
}

/** End wall time for a start and duration; `dayOffset` > 0 when it ends on a later day. */
export function endOf(hhmm: string, durationMinutes: number): { hhmm: string; dayOffset: number } {
  const total = minutesOf(hhmm) + durationMinutes;
  const dayOffset = Math.floor(total / 1440);
  const rest = total - dayOffset * 1440;
  return { hhmm: `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`, dayOffset };
}
