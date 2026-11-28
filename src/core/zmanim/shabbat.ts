/**
 * Candle lighting and havdalah for Shabbat and Yom Tov, by the usual rules (as Hebcal lists them):
 *  - The day before Shabbat / Yom Tov (itself an ordinary day): candles N minutes before sunset.
 *  - A holy day followed by another one (Yom Tov → Shabbat, Shabbat → Yom Tov, two-day Yom Tov): candles
 *    for the second are lit only after nightfall, at the havdalah time — except on a Friday that is Yom Tov,
 *    where Shabbat candles are lit before sunset as usual.
 *  - The last holy day before an ordinary day: havdalah at nightfall.
 * Times come from our own sunset calculation (sun.ts) and are rounded exactly like Hebcal's.
 */
import { jewishHolidays } from "../holidays/jewish";
import type { Range } from "../events/expand";
import { weekdayOf, type EpochDay } from "../time/epochDay";
import { candleLightingMs, havdalahMinutesMs, roundToMinute, sunsetMs, tzeitMs } from "./sun";

export type Havdalah = { degrees: number } | { minutes: number };

export interface ShabbatOptions {
  lat: number;
  lon: number;
  region: "il" | "diaspora";
  /** Minutes before sunset (18 usually; 30 in Haifa, 40 in Jerusalem). */
  candleMinutes: number;
  havdalah: Havdalah;
}

export interface ZmanEntry {
  kind: "candles" | "havdalah";
  /** The civil day the entry falls on. */
  epochDay: EpochDay;
  /** Exact instant, ms (already rounded to the minute). */
  at: number;
}

const SATURDAY = 6;

/** Nightfall per the chosen havdalah method. */
function nightfall(day: EpochDay, o: ShabbatOptions): number {
  return "degrees" in o.havdalah
    ? roundToMinute(tzeitMs(day, o.lat, o.lon, o.havdalah.degrees))
    : havdalahMinutesMs(sunsetMs(day, o.lat, o.lon), o.havdalah.minutes);
}

export function shabbatTimes(range: Range, o: ShabbatOptions): ZmanEntry[] {
  // Holy days around the range (one day of margin on each side for the "before / after" rules).
  const yomTov = new Set(
    jewishHolidays.occurrences({ start: range.start - 1, end: range.end + 2 }, { region: o.region, categories: ["major"] })
      .filter((h) => h.yomTov).map((h) => h.epochDay),
  );
  const holy = (d: EpochDay) => weekdayOf(d) === SATURDAY || yomTov.has(d);
  const out: ZmanEntry[] = [];
  for (let d = range.start; d < range.end; d++) {
    const next = holy(d + 1);
    if (!holy(d)) {
      if (next) out.push({ kind: "candles", epochDay: d, at: candleLightingMs(sunsetMs(d, o.lat, o.lon), o.candleMinutes) });
      continue;
    }
    if (!next) { out.push({ kind: "havdalah", epochDay: d, at: nightfall(d, o) }); continue; }
    // Holy day followed by another: Friday Yom Tov → Shabbat candles before sunset; otherwise after nightfall.
    const fridayBeforeShabbat = weekdayOf(d + 1) === SATURDAY;
    out.push({ kind: "candles", epochDay: d, at: fridayBeforeShabbat ? candleLightingMs(sunsetMs(d, o.lat, o.lon), o.candleMinutes) : nightfall(d, o) });
  }
  return out;
}
