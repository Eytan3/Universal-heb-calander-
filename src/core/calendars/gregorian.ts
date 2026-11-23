/**
 * Gregorian calendar engine, backed by Temporal (ISO-8601 = proleptic Gregorian)
 * and Intl for localized names. No calendar arithmetic is hand-written here.
 */
import { Temporal } from "temporal-polyfill";
import { epochDayToIsoPlainDate, isoPlainDateToEpochDay, type EpochDay } from "../time/epochDay";
import type { CalendarAdapter, CalendarDate, Locale, MonthInfo, SkipPolicy, YearMonth } from "./types";

const CODES = Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`);

function monthNumber(code: string): number | null {
  const i = CODES.indexOf(code);
  return i < 0 ? null : i + 1;
}

const intlLocale = (l: Locale) => (l === "he" ? "he-IL-u-ca-gregory" : "en-GB-u-ca-gregory");

function plain(date: { year: number; monthCode: string; day: number }): Temporal.PlainDate {
  return Temporal.PlainDate.from(
    { year: date.year, monthCode: date.monthCode, day: date.day },
    { overflow: "reject" },
  );
}

export const gregorian: CalendarAdapter = {
  id: "gregory",
  dayBoundary: "midnight",
  patternYears: 400,
  minYear: 1,
  maxYear: 9999,

  isValid(d) {
    if (!Number.isInteger(d.year) || d.year < this.minYear || d.year > this.maxYear) return false;
    if (monthNumber(d.monthCode) === null || !Number.isInteger(d.day)) return false;
    const days = this.daysInMonth(d.year, d.monthCode);
    return days !== null && d.day >= 1 && d.day <= days;
  },

  toEpochDay(d) {
    if (!this.isValid(d)) throw new RangeError(`Invalid Gregorian date ${JSON.stringify(d)}`);
    return isoPlainDateToEpochDay(plain(d));
  },

  fromEpochDay(day: EpochDay): CalendarDate {
    const p = epochDayToIsoPlainDate(day);
    return { calendar: "gregory", year: p.year, monthCode: p.monthCode, day: p.day };
  },

  isLeapYear(year) {
    return Temporal.PlainDate.from({ year, month: 1, day: 1 }).inLeapYear;
  },

  monthsInYear(year): MonthInfo[] {
    return CODES.map((monthCode, i) => ({
      monthCode,
      ordinal: i + 1,
      days: Temporal.PlainYearMonth.from({ year, month: i + 1 }).daysInMonth,
      isLeapMonth: false,
    }));
  },

  daysInMonth(year, monthCode) {
    const m = monthNumber(monthCode);
    return m === null ? null : Temporal.PlainYearMonth.from({ year, month: m }).daysInMonth;
  },

  addMonths(ym: YearMonth, delta: number): YearMonth {
    const p = Temporal.PlainYearMonth.from({ year: ym.year, monthCode: ym.monthCode }).add({ months: delta });
    return { year: p.year, monthCode: p.monthCode };
  },

  allMonthCodes: () => [...CODES],

  substituteMissingMonth(_year: number, _code: string, _skip: SkipPolicy) {
    return null; // Gregorian months never go missing.
  },

  monthName(ym, locale, style = "long") {
    if (style === "long") return this.genericMonthName(ym.monthCode, locale);
    return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", timeZone: "UTC" }).format(
      Date.UTC(2000, (monthNumber(ym.monthCode) ?? 1) - 1, 1),
    );
  },

  genericMonthName(code, locale) {
    const m = monthNumber(code) ?? 1;
    return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", timeZone: "UTC" }).format(
      Date.UTC(2000, m - 1, 1),
    );
  },

  formatYear: (year) => String(year),
  formatDayNumber: (day) => String(day),

  formatDate(d, locale) {
    const m = monthNumber(d.monthCode) ?? 1;
    return new Intl.DateTimeFormat(intlLocale(locale), {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    }).format(Date.UTC(d.year, m - 1, d.day));
  },

  calendarName: (locale) => (locale === "he" ? "לוח גרגוריאני" : "Gregorian"),
};
