/**
 * Hebrew calendar engine, backed by Hebcal (@hebcal/hdate).
 *
 * Month identity follows Temporal / ECMA-402 month codes so that a Hebrew date
 * never depends on Gregorian month boundaries:
 *
 *   M01 Tishrei   M02 Cheshvan  M03 Kislev  M04 Tevet  M05 Shevat
 *   M05L Adar I (leap years only)
 *   M06 Adar (common years) / Adar II (leap years)
 *   M07 Nisan  M08 Iyyar  M09 Sivan  M10 Tammuz  M11 Av  M12 Elul
 *
 * The year runs Tishrei → Elul, as in the civil Hebrew year count.
 * Hebcal numbers months from Nisan (1) and silently normalises invalid dates,
 * so every input is validated here before reaching it.
 */
import { HDate, Locale as HebcalLocale, gematriya, months } from "@hebcal/hdate";
import { RATA_DIE_OF_EPOCH, type EpochDay } from "../time/epochDay";
import type { CalendarAdapter, CalendarDate, Locale, MonthInfo, SkipPolicy, YearMonth } from "./types";

const ALL_CODES = ["M01", "M02", "M03", "M04", "M05", "M05L", "M06", "M07", "M08", "M09", "M10", "M11", "M12"];

const BASE_CODE_TO_HEBCAL: Record<string, number> = {
  M01: months.TISHREI, M02: months.CHESHVAN, M03: months.KISLEV, M04: months.TEVET, M05: months.SHVAT,
  M07: months.NISAN, M08: months.IYYAR, M09: months.SIVAN, M10: months.TAMUZ, M11: months.AV, M12: months.ELUL,
};

const isLeap = (year: number) => HDate.isLeapYear(year);
const COMMON_CODES = ALL_CODES.filter((c) => c !== "M05L");
const codesOf = (year: number) => (isLeap(year) ? ALL_CODES : COMMON_CODES);

/** Hebcal month number for a month code in a given year, or null if that month does not exist that year. */
function toHebcalMonth(year: number, code: string): number | null {
  if (code === "M05L") return isLeap(year) ? months.ADAR_I : null;
  if (code === "M06") return isLeap(year) ? months.ADAR_II : months.ADAR_I; // Hebcal: 12 = "Adar" in common years
  return BASE_CODE_TO_HEBCAL[code] ?? null;
}

function fromHebcalMonth(year: number, hm: number): string {
  if (hm === months.ADAR_I) return isLeap(year) ? "M05L" : "M06";
  if (hm === months.ADAR_II) return "M06";
  const entry = Object.entries(BASE_CODE_TO_HEBCAL).find(([, v]) => v === hm);
  if (!entry) throw new RangeError(`Unknown Hebcal month ${hm}`);
  return entry[0];
}

/** English transliterations as used by Hebcal; Hebrew forms come from Hebcal's locale (no niqqud). */
const GENERIC_EN: Record<string, string> = {
  M01: "Tishrei", M02: "Cheshvan", M03: "Kislev", M04: "Tevet", M05: "Sh'vat",
  M05L: "Adar I", M06: "Adar", M07: "Nisan", M08: "Iyyar", M09: "Sivan", M10: "Tamuz", M11: "Av", M12: "Elul",
};

const heName = (en: string) => HebcalLocale.gettext(en, "he-x-nonikud");

export const hebrew: CalendarAdapter = {
  id: "hebrew",
  dayBoundary: "sunset",
  patternYears: 19,
  minYear: 3762, // ≈ 1 CE; keeps conversions inside Hebcal's well-tested range
  maxYear: 9999,

  isValid(d) {
    if (!Number.isInteger(d.year) || d.year < this.minYear || d.year > this.maxYear) return false;
    if (!Number.isInteger(d.day)) return false;
    const days = this.daysInMonth(d.year, d.monthCode);
    return days !== null && d.day >= 1 && d.day <= days;
  },

  toEpochDay(d) {
    if (!this.isValid(d)) throw new RangeError(`Invalid Hebrew date ${JSON.stringify(d)}`);
    const hm = toHebcalMonth(d.year, d.monthCode)!;
    return new HDate(d.day, hm, d.year).abs() - RATA_DIE_OF_EPOCH;
  },

  fromEpochDay(day: EpochDay): CalendarDate {
    const h = new HDate(day + RATA_DIE_OF_EPOCH);
    const year = h.getFullYear();
    return { calendar: "hebrew", year, monthCode: fromHebcalMonth(year, h.getMonth()), day: h.getDate() };
  },

  isLeapYear: isLeap,

  monthsInYear(year): MonthInfo[] {
    return ALL_CODES.filter((c) => c !== "M05L" || isLeap(year)).map((monthCode, i) => ({
      monthCode,
      ordinal: i + 1,
      days: HDate.daysInMonth(toHebcalMonth(year, monthCode)!, year),
      isLeapMonth: monthCode === "M05L",
    }));
  },

  daysInMonth(year, monthCode) {
    const hm = toHebcalMonth(year, monthCode);
    return hm === null ? null : HDate.daysInMonth(hm, year);
  },

  addMonths(ym: YearMonth, delta: number): YearMonth {
    // Uses only the leap-year test per year (cheap), not full month tables, so large deltas stay fast.
    let { year } = ym;
    let list = codesOf(year);
    let idx = list.indexOf(ym.monthCode);
    if (idx < 0) idx = list.indexOf("M06"); // a leap month viewed in a common year → Adar
    idx += delta;
    while (idx >= list.length) { idx -= list.length; year += 1; list = codesOf(year); }
    while (idx < 0) { year -= 1; list = codesOf(year); idx += list.length; }
    return { year, monthCode: list[idx] };
  },

  allMonthCodes: () => [...ALL_CODES],

  /**
   * Adar I (M05L) is the only Hebrew month that can be missing. Per RFC 7529 §4.3.3,
   * SKIP=FORWARD moves it to month 6 (Adar); BACKWARD moves it to month 5 (Shevat).
   */
  substituteMissingMonth(year, code, skip: SkipPolicy) {
    if (code !== "M05L" || isLeap(year) || skip === "omit") return null;
    return skip === "forward" ? "M06" : "M05";
  },

  monthName(ym, locale) {
    let en = GENERIC_EN[ym.monthCode] ?? ym.monthCode;
    if (ym.monthCode === "M06" && isLeap(ym.year)) en = "Adar II";
    return locale === "he" ? heName(en) : en;
  },

  genericMonthName(code, locale) {
    if (code === "M06") return locale === "he" ? "אדר / אדר ב׳" : "Adar / Adar II";
    const en = GENERIC_EN[code] ?? code;
    return locale === "he" ? heName(en) : en;
  },

  formatYear: (year, locale) => (locale === "he" ? gematriya(year) : String(year)),
  formatDayNumber: (day, locale) => (locale === "he" ? gematriya(day) : String(day)),

  formatDate(d, locale) {
    const month = this.monthName({ year: d.year, monthCode: d.monthCode }, locale);
    return `${this.formatDayNumber(d.day, locale)} ${month} ${this.formatYear(d.year, locale)}`;
  },

  calendarName: (locale) => (locale === "he" ? "לוח עברי" : "Hebrew"),
};
