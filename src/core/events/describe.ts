import { getCalendar } from "../calendars/registry";
import type { Locale } from "../calendars/types";
import type { UCEvent } from "./schema";

const T = {
  en: {
    once: "One-time",
    yearly: (date: string, cal: string) => `Every year on ${date} (${cal} calendar)`,
    everyN: (n: number, date: string, cal: string) => `Every ${n} years on ${date} (${cal} calendar)`,
    skip: { omit: "skipped in years without this date", backward: "moves to the previous valid day when missing", forward: "moves to the next valid day when missing" },
  },
  he: {
    once: "חד־פעמי",
    yearly: (date: string, cal: string) => `בכל שנה ב־${date} (${cal})`,
    everyN: (n: number, date: string, cal: string) => `כל ${n} שנים ב־${date} (${cal})`,
    skip: { omit: "מדולג בשנים שבהן התאריך אינו קיים", backward: "עובר ליום התקף הקודם כשהתאריך חסר", forward: "עובר ליום התקף הבא כשהתאריך חסר" },
  },
};

/** Human-readable description of an event's rule, always phrased in its own calendar. */
export function describeRule(event: UCEvent, locale: Locale, withSkip = false): string {
  const cal = getCalendar(event.start.calendar);
  const t = T[locale];
  const rule = event.recurrenceRules?.[0];
  if (!rule) return t.once;
  const md = `${cal.formatDayNumber(event.start.day, locale)} ${cal.genericMonthName(event.start.monthCode, locale)}`;
  const calName = cal.calendarName(locale);
  const base = (rule.interval ?? 1) > 1 ? t.everyN(rule.interval!, md, calName) : t.yearly(md, calName);
  return withSkip ? `${base}; ${t.skip[rule.skip ?? "omit"]}` : base;
}
