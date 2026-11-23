import { getCalendar } from "../calendars/registry";
import type { Locale } from "../calendars/types";
import { weekdayOf } from "../time/epochDay";
import type { Frequency, UCEvent } from "./schema";

const weekdayName = (day: number, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", { weekday: "long", timeZone: "UTC" })
    .format(Date.UTC(2023, 0, 1 + weekdayOf(day))); // 2023-01-01 was a Sunday

const T = {
  en: {
    once: "One-time",
    daily: (n: number) => (n === 1 ? "Every day" : `Every ${n} days`),
    weekly: (n: number, wd: string) => (n === 1 ? `Every week on ${wd}` : `Every ${n} weeks on ${wd}`),
    monthly: (n: number, d: string, cal: string) => `${n === 1 ? "Every month" : `Every ${n} months`} on day ${d} (${cal} months)`,
    yearly: (n: number, md: string, cal: string) => `${n === 1 ? "Every year" : `Every ${n} years`} on ${md} (${cal} calendar)`,
    skip: { omit: "skipped when the date doesn't exist", backward: "moves to the previous valid day when missing", forward: "moves to the next valid day when missing" },
  },
  he: {
    once: "חד־פעמי",
    daily: (n: number) => (n === 1 ? "כל יום" : `כל ${n} ימים`),
    weekly: (n: number, wd: string) => (n === 1 ? `כל שבוע ב${wd}` : `כל ${n} שבועות ב${wd}`),
    monthly: (n: number, d: string, cal: string) => `${n === 1 ? "כל חודש" : `כל ${n} חודשים`} ב־${d} לחודש (${cal})`,
    yearly: (n: number, md: string, cal: string) => `${n === 1 ? "כל שנה" : `כל ${n} שנים`} ב־${md} (${cal})`,
    skip: { omit: "מדולג כשהתאריך אינו קיים", backward: "עובר ליום התקף הקודם כשהתאריך חסר", forward: "עובר ליום התקף הבא כשהתאריך חסר" },
  },
};

/** Human-readable description of an event's rule, always phrased in its own calendar. */
export function describeRule(event: UCEvent, locale: Locale, withSkip = false): string {
  const cal = getCalendar(event.start.calendar);
  const t = T[locale];
  const rule = event.recurrenceRules?.[0];
  if (!rule) return t.once;
  const n = rule.interval ?? 1;
  const calName = cal.calendarName(locale);
  const freq: Frequency = rule.frequency;
  let base: string;
  if (freq === "daily") base = t.daily(n);
  else if (freq === "weekly") base = t.weekly(n, weekdayName(cal.toEpochDay(event.start), locale));
  else if (freq === "monthly") base = t.monthly(n, cal.formatDayNumber(event.start.day, locale), calName);
  else base = t.yearly(n, `${cal.formatDayNumber(event.start.day, locale)} ${cal.genericMonthName(event.start.monthCode, locale)}`, calName);
  const usesSkip = freq === "monthly" || freq === "yearly";
  return withSkip && usesSkip ? `${base}; ${t.skip[rule.skip ?? "omit"]}` : base;
}
