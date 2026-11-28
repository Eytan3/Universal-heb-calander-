/**
 * Entries of a computed calendar: generated from the calendar's own settings, never stored —
 * holidays from the rules, plus (when a place is set) candle lighting and havdalah times.
 */
import { DEFAULT_JEWISH_SETTINGS, type Collection } from "../events/schema";
import type { Range } from "../events/expand";
import { jewishHolidays } from "./jewish";
import { shabbatTimes } from "../zmanim/shabbat";
import type { HolidayOccurrence } from "./types";

export function computedOccurrences(c: Collection, range: Range): HolidayOccurrence[] {
  if (c.kind !== "jewish") return [];
  const s = c.jewish ?? DEFAULT_JEWISH_SETTINGS;
  const out = jewishHolidays.occurrences(range, { region: s.region, categories: s.categories });
  if (s.zmanim) {
    const z = s.zmanim;
    for (const e of shabbatTimes(range, { lat: z.place.lat, lon: z.place.lon, region: s.region, candleMinutes: z.candleMinutes, havdalah: z.havdalah })) {
      if (!Number.isFinite(e.at)) continue; // no sunset that day (far north/south)
      out.push({
        id: e.kind, epochDay: e.epochDay, set: "zmanim", category: "zmanim", yomTov: false,
        en: e.kind === "candles" ? "Candle lighting" : "Havdalah",
        he: e.kind === "candles" ? "הדלקת נרות" : "הבדלה",
        at: e.at, timeZone: z.place.tz,
      });
    }
    out.sort((a, b) => a.epochDay - b.epochDay || (a.at ?? -1) - (b.at ?? -1));
  }
  return out;
}
