/**
 * Calendar Engine contract.
 *
 * Every calendar is a peer: it converts its own dates to and from the
 * calendar-neutral EpochDay axis and describes its own year/month structure.
 * Nothing in this interface assumes Gregorian months.
 *
 * Month identity uses Temporal / ECMA-402 month codes ("M01".."M13", with an
 * "L" suffix for leap months, e.g. Hebrew Adar I = "M05L"). These are the same
 * identifiers RFC 7529 (RSCALE) writes as BYMONTH=5L.
 */
import type { EpochDay } from "../time/epochDay";

/** CLDR / BCP-47 calendar identifiers, as used by Intl and Temporal. */
export type CalendarId = "gregory" | "hebrew";

export interface CalendarDate {
  calendar: CalendarId;
  year: number;
  monthCode: string;
  day: number;
}

export interface YearMonth {
  year: number;
  monthCode: string;
}

export interface MonthInfo {
  monthCode: string;
  /** 1-based position of the month within this particular year. */
  ordinal: number;
  days: number;
  isLeapMonth: boolean;
}

export type Locale = "en" | "he";

/** RFC 7529 SKIP semantics for dates that do not exist in a given year. */
export type SkipPolicy = "omit" | "backward" | "forward";

export interface CalendarAdapter {
  readonly id: CalendarId;
  /** Where a civil day of this calendar begins. The MVP computes only midnight-based days; see ARCHITECTURE.md. */
  readonly dayBoundary: "midnight" | "sunset";
  /** Typical cycle (in years) after which month/leap patterns repeat closely enough for heuristics. */
  readonly patternYears: number;
  readonly minYear: number;
  readonly maxYear: number;

  isValid(date: Omit<CalendarDate, "calendar">): boolean;
  toEpochDay(date: Omit<CalendarDate, "calendar">): EpochDay;
  fromEpochDay(day: EpochDay): CalendarDate;

  isLeapYear(year: number): boolean;
  /** Months of the given year, in order. */
  monthsInYear(year: number): MonthInfo[];
  /** Number of days, or null if the month does not exist in that year. */
  daysInMonth(year: number, monthCode: string): number | null;
  addMonths(ym: YearMonth, delta: number): YearMonth;
  /** Every month code the calendar can ever use, in canonical order. */
  allMonthCodes(): string[];

  /**
   * Calendar-specific rule for a month that is missing in `year` (e.g. Hebrew Adar I
   * in a common year). Returns the substitute month code or null to omit.
   */
  substituteMissingMonth(year: number, monthCode: string, skip: SkipPolicy): string | null;

  monthName(ym: YearMonth, locale: Locale, style?: "long" | "short"): string;
  /** Year-independent name for a month code (used by editors and rule descriptions). */
  genericMonthName(monthCode: string, locale: Locale): string;
  formatYear(year: number, locale: Locale): string;
  formatDayNumber(day: number, locale: Locale): string;
  formatDate(date: Omit<CalendarDate, "calendar">, locale: Locale): string;
  calendarName(locale: Locale): string;
}
