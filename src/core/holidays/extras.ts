/**
 * Counting of the Omer and the special Shabbatot — our own rules, verified against Hebcal.
 */
import { hebrew } from "../calendars/hebrew";
import type { Range } from "../events/expand";
import { weekdayOf, type EpochDay } from "../time/epochDay";
import { parashot } from "./parasha";

const SATURDAY = 6;
const md = (year: number, monthCode: string, day: number) => hebrew.toEpochDay({ year, monthCode, day });
const shabbatOnOrBefore = (d: EpochDay) => d - ((weekdayOf(d) - SATURDAY + 7) % 7);
const shabbatAfter = (d: EpochDay) => d + 1 + ((SATURDAY - weekdayOf(d + 1) + 7) % 7);

/** Day N of the Omer (1–49) falls on 15 Nisan + N (counted the evening before). */
export function omerDays(range: Range): { epochDay: EpochDay; n: number }[] {
  const out: { epochDay: EpochDay; n: number }[] = [];
  const first = hebrew.fromEpochDay(range.start).year, last = hebrew.fromEpochDay(range.end - 1).year;
  for (let y = first; y <= last; y++) {
    const pesach = md(y, "M07", 15);
    for (let n = 1; n <= 49; n++) if (pesach + n >= range.start && pesach + n < range.end) out.push({ epochDay: pesach + n, n });
  }
  return out;
}

export type SpecialShabbat = "shuva" | "shirah" | "shekalim" | "zachor" | "parah" | "hachodesh" | "hagadol" | "chazon" | "nachamu";
export const SPECIAL_NAMES: Record<SpecialShabbat, [string, string]> = {
  shuva: ["Shabbat Shuva", "שבת שובה"], shirah: ["Shabbat Shirah", "שבת שירה"], shekalim: ["Shabbat Shekalim", "שבת שקלים"],
  zachor: ["Shabbat Zachor", "שבת זכור"], parah: ["Shabbat Parah", "שבת פרה"], hachodesh: ["Shabbat HaChodesh", "שבת החודש"],
  hagadol: ["Shabbat HaGadol", "שבת הגדול"], chazon: ["Shabbat Chazon", "שבת חזון"], nachamu: ["Shabbat Nachamu", "שבת נחמו"],
};

export function specialShabbatot(range: Range, region: "il" | "diaspora"): { epochDay: EpochDay; id: SpecialShabbat }[] {
  const out: { epochDay: EpochDay; id: SpecialShabbat }[] = [];
  const first = hebrew.fromEpochDay(range.start).year, last = hebrew.fromEpochDay(range.end - 1).year;
  for (let y = first; y <= last; y++) {
    // Adar of Purim: Adar in a common year, Adar II in a leap year — both are month code M06.
    const hachodesh = shabbatOnOrBefore(md(y, "M07", 1));
    const days: [EpochDay, SpecialShabbat][] = [
      [shabbatAfter(md(y, "M01", 2)), "shuva"], // between Rosh Hashana and Yom Kippur
      [shabbatOnOrBefore(md(y, "M06", 1)), "shekalim"], // on or before Rosh Chodesh Adar
      [shabbatOnOrBefore(md(y, "M06", 13)), "zachor"], // the Shabbat before Purim
      [hachodesh - 7, "parah"], // the Shabbat before HaChodesh
      [hachodesh, "hachodesh"], // on or before Rosh Chodesh Nisan
      [shabbatOnOrBefore(md(y, "M07", 14)), "hagadol"], // the Shabbat before Pesach
      [shabbatOnOrBefore(md(y, "M11", 9)), "chazon"], // on or before Tisha B'Av
      [shabbatAfter(md(y, "M11", 9)), "nachamu"], // after Tisha B'Av
    ];
    // Shirah: the Shabbat of Beshalach
    const yearStart = md(y, "M01", 1), yearEnd = md(y + 1, "M01", 1);
    const beshalach = parashot({ start: yearStart, end: yearEnd }, region).find((r) => r.en === "Beshalach");
    if (beshalach) days.push([beshalach.epochDay, "shirah"]);
    for (const [d, id] of days) if (d >= range.start && d < range.end) out.push({ epochDay: d, id });
  }
  return out.sort((a, b) => a.epochDay - b.epochDay);
}
