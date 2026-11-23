/**
 * Universal Time Axis — civil-day coordinate.
 *
 * An EpochDay is an integer count of whole civil days since 1970-01-01 in the
 * proleptic ISO-8601 day count (the same integer Temporal and Unix tooling
 * call "epoch days"). The epoch is only an origin for counting; it carries no
 * calendar semantics. Every calendar adapter converts to and from this axis,
 * and no calendar is converted *through* another calendar.
 *
 * Three distinct kinds of time exist in the system:
 *   1. Absolute instants  — Temporal.Instant (nanoseconds since the Unix epoch, UTC).
 *   2. Absolute civil days — EpochDay (this module).
 *   3. Calendar dates      — CalendarDate { calendar, year, monthCode, day }.
 *
 * An instant becomes a civil day only relative to a time zone (and, for
 * calendars whose day begins at sunset, relative to a location). The MVP
 * implements the midnight boundary only; see ARCHITECTURE.md §Day boundaries.
 */
import { Temporal } from "temporal-polyfill";

export type EpochDay = number;

const ISO_EPOCH = Temporal.PlainDate.from("1970-01-01");

/** Rata Die (R.D., 0001-01-01 proleptic Gregorian = 1) of 1970-01-01. Used to bridge Hebcal's absolute day count. */
export const RATA_DIE_OF_EPOCH = 719163;

export function isEpochDay(n: unknown): n is EpochDay {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/** Civil day on which an instant falls, in an explicit IANA time zone. */
export function epochDayOfInstant(instant: Temporal.Instant, timeZone: string): EpochDay {
  const date = instant.toZonedDateTimeISO(timeZone).toPlainDate();
  return isoPlainDateToEpochDay(date);
}

/** Today's civil day in the given time zone (defaults to the runtime's zone). */
export function todayEpochDay(timeZone: string = Temporal.Now.timeZoneId()): EpochDay {
  return epochDayOfInstant(Temporal.Now.instant(), timeZone);
}

export function isoPlainDateToEpochDay(date: Temporal.PlainDate): EpochDay {
  return ISO_EPOCH.until(date.withCalendar("iso8601"), { largestUnit: "days" }).days;
}

export function epochDayToIsoPlainDate(day: EpochDay): Temporal.PlainDate {
  return ISO_EPOCH.add({ days: day });
}

/** Day of week, 0 = Sunday … 6 = Saturday. The 7-day cycle is calendar-independent. */
export function weekdayOf(day: EpochDay): number {
  return epochDayToIsoPlainDate(day).dayOfWeek % 7; // ISO: Mon=1 … Sun=7
}
