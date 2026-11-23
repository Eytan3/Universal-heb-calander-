/**
 * Deterministic expansion of calendar-native event definitions into occurrences
 * on the absolute EpochDay axis. Expansion happens in the event's own calendar:
 * a Hebrew yearly rule iterates Hebrew years, a Gregorian rule Gregorian years.
 */
import { getCalendar } from "../calendars/registry";
import type { CalendarAdapter, CalendarDate, SkipPolicy } from "../calendars/types";
import type { EpochDay } from "../time/epochDay";
import type { UCEvent } from "./schema";

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

/** True if month/day fails to exist in at least one year of the calendar's pattern cycle (used by editors). */
export function mayBeMissing(cal: CalendarAdapter, fromYear: number, monthCode: string, day: number): boolean {
  const span = cal.patternYears === 400 ? 8 : cal.patternYears * 2; // Gregorian: Feb 29 shows within 8 years
  for (let y = fromYear + 1; y <= fromYear + span && y <= cal.maxYear; y++) {
    const d = cal.daysInMonth(y, monthCode);
    if (d === null || day > d) return true;
  }
  return false;
}
