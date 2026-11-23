/**
 * Deterministic expansion of calendar-native event definitions into occurrences
 * on the absolute EpochDay axis. Expansion happens in the event's own calendar:
 * a Hebrew yearly rule iterates Hebrew years, a Gregorian rule Gregorian years.
 */
import { getCalendar } from "../calendars/registry";
import type { CalendarAdapter, CalendarDate, SkipPolicy } from "../calendars/types";
import type { EpochDay } from "../time/epochDay";
import type { Frequency, UCEvent } from "./schema";

export type Adjustment = "none" | "month-substituted" | "day-backward" | "day-forward";

export interface Occurrence {
  eventUid: string;
  /** Stable per-occurrence key: the rule's calendar + iteration year. Used for ICS UIDs. */
  key: string;
  epochDay: EpochDay;
  /** The occurrence as a date in the event's own calendar. */
  native: CalendarDate;
  adjustment: Adjustment;
}

export interface Range {
  start: EpochDay;
  /** Exclusive. */
  end: EpochDay;
}

export interface ResolvedDate {
  date: CalendarDate;
  adjustment: Adjustment;
}

/**
 * Resolve "month M, day D" in a given year of a calendar, applying RFC 7529 SKIP:
 * first to a missing month (calendar-specific), then to a missing day-of-month.
 */
export function resolveYearlyDate(
  cal: CalendarAdapter, year: number, monthCode: string, day: number, skip: SkipPolicy,
): ResolvedDate | null {
  let code = monthCode;
  let adjustment: Adjustment = "none";

  if (cal.daysInMonth(year, code) === null) {
    const sub = cal.substituteMissingMonth(year, code, skip);
    if (!sub) return null;
    code = sub;
    adjustment = "month-substituted";
  }

  const days = cal.daysInMonth(year, code)!;
  if (day <= days) return { date: { calendar: cal.id, year, monthCode: code, day }, adjustment };

  if (skip === "omit") return null;
  if (skip === "backward") return { date: { calendar: cal.id, year, monthCode: code, day: days }, adjustment: "day-backward" };
  const next = cal.addMonths({ year, monthCode: code }, 1);
  return { date: { calendar: cal.id, ...next, day: 1 }, adjustment: "day-forward" };
}

export function expandEvent(event: UCEvent, range: Range): Occurrence[] {
  const cal = getCalendar(event.start.calendar);
  const rule = event.recurrenceRules?.[0];
  const { start } = event;

  if (!rule) {
    const epochDay = cal.toEpochDay(start);
    return epochDay >= range.start && epochDay < range.end
      ? [{ eventUid: event.uid, key: "single", epochDay, native: { ...start }, adjustment: "none" }]
      : [];
  }

  if (rule.frequency === "daily" || rule.frequency === "weekly") return expandFixedStep(event, range);
  if (rule.frequency === "monthly") return expandMonthly(event, range);

  const interval = rule.interval ?? 1;
  const skip = rule.skip ?? "omit";
  // A small margin of native years either side covers year boundaries that do not align with the range.
  const loYear = Math.max(start.year, cal.fromEpochDay(range.start).year - 1);
  const hiYear = Math.min(cal.maxYear, cal.fromEpochDay(range.end).year + 1);
  const out: Occurrence[] = [];

  for (let y = loYear; y <= hiYear; y++) {
    if ((y - start.year) % interval !== 0) continue;
    const resolved = y === start.year
      ? { date: { ...start }, adjustment: "none" as Adjustment }
      : resolveYearlyDate(cal, y, start.monthCode, start.day, skip);
    if (!resolved) continue;
    const epochDay = cal.toEpochDay(resolved.date);
    if (epochDay < range.start || epochDay >= range.end) continue;
    out.push({ eventUid: event.uid, key: `${cal.id}-${y}`, epochDay, native: resolved.date, adjustment: resolved.adjustment });
  }
  return out;
}

/** Safety cap on occurrences produced by one event for one range. */
const MAX_OCCURRENCES = 5000;

/** Daily / weekly: a fixed number of days on the absolute axis — the same in every calendar. */
function expandFixedStep(event: UCEvent, range: Range): Occurrence[] {
  const cal = getCalendar(event.start.calendar);
  const rule = event.recurrenceRules![0];
  const step = (rule.interval ?? 1) * (rule.frequency === "weekly" ? 7 : 1);
  const first = cal.toEpochDay(event.start);
  const k0 = Math.max(0, Math.ceil((range.start - first) / step));
  const out: Occurrence[] = [];
  for (let d = first + k0 * step; d < range.end && out.length < MAX_OCCURRENCES; d += step) {
    out.push({ eventUid: event.uid, key: `day-${d}`, epochDay: d, native: cal.fromEpochDay(d), adjustment: "none" });
  }
  return out;
}

/**
 * Monthly: the same day-of-month every N months of the event's own calendar.
 * A Hebrew monthly event follows Hebrew months (including Adar I in leap years);
 * a 30th that a 29-day month lacks is handled by the rule's SKIP policy.
 */
function expandMonthly(event: UCEvent, range: Range): Occurrence[] {
  const cal = getCalendar(event.start.calendar);
  const rule = event.recurrenceRules![0];
  const interval = rule.interval ?? 1;
  const skip = rule.skip ?? "omit";
  const { start } = event;
  const startYm = { year: start.year, monthCode: start.monthCode };
  const firstDay = cal.toEpochDay(start);

  // Jump close to the range instead of walking every month since the start (months are ≥ 28 days).
  let k = Math.max(0, Math.floor((range.start - firstDay) / 31) - 2);
  k -= k % interval;
  const out: Occurrence[] = [];
  for (; out.length < MAX_OCCURRENCES; k += interval) {
    const ym = cal.addMonths(startYm, k);
    if (ym.year > cal.maxYear) break;
    const monthStart = cal.toEpochDay({ ...ym, day: 1 });
    if (monthStart >= range.end) break;
    const days = cal.daysInMonth(ym.year, ym.monthCode)!;
    let date: CalendarDate | null = { calendar: cal.id, ...ym, day: start.day };
    let adjustment: Adjustment = "none";
    if (start.day > days) {
      if (skip === "omit") date = null;
      else if (skip === "backward") { date = { calendar: cal.id, ...ym, day: days }; adjustment = "day-backward"; }
      else { date = { calendar: cal.id, ...cal.addMonths(ym, 1), day: 1 }; adjustment = "day-forward"; }
    }
    if (!date) continue;
    const epochDay = cal.toEpochDay(date);
    if (epochDay < range.start || epochDay >= range.end || epochDay < firstDay) continue;
    out.push({ eventUid: event.uid, key: `${cal.id}-${ym.year}-${ym.monthCode}`, epochDay, native: date, adjustment });
  }
  return out;
}

export function expandAll(events: UCEvent[], range: Range): Occurrence[] {
  return events.flatMap((e) => expandEvent(e, range)).sort((a, b) => a.epochDay - b.epochDay || a.eventUid.localeCompare(b.eventUid));
}

/** Index occurrences by EpochDay for rendering any calendar view. */
export function byDay(occurrences: Occurrence[]): Map<EpochDay, Occurrence[]> {
  const m = new Map<EpochDay, Occurrence[]>();
  for (const o of occurrences) {
    const list = m.get(o.epochDay);
    if (list) list.push(o); else m.set(o.epochDay, [o]);
  }
  return m;
}

/** True if the rule's date can be missing in some occurrence, so the editor should ask for a SKIP policy. */
export function ruleMayHitMissingDate(cal: CalendarAdapter, start: CalendarDate, frequency: Frequency): boolean {
  if (frequency === "yearly") return mayBeMissing(cal, start.year, start.monthCode, start.day);
  if (frequency === "monthly") {
    for (let k = 1; k <= 26; k++) {
      const ym = cal.addMonths({ year: start.year, monthCode: start.monthCode }, k);
      if (start.day > cal.daysInMonth(ym.year, ym.monthCode)!) return true;
    }
  }
  return false;
}

/** True if month/day fails to exist in at least one year of the calendar's pattern cycle (used by editors). */
export function mayBeMissing(cal: CalendarAdapter, fromYear: number, monthCode: string, day: number): boolean {
  const span = cal.patternYears === 400 ? 8 : cal.patternYears * 2; // Gregorian: Feb 29 shows within 8 years
  for (let y = fromYear + 1; y <= fromYear + span && y <= cal.maxYear; y++) {
    const d = cal.daysInMonth(y, monthCode);
    if (d === null || day > d) return true;
  }
  return false;
}
