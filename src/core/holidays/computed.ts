/**
 * Entries of a computed calendar: generated from the calendar's own settings, never stored —
 * holidays from the rules, plus (when a place is set) candle lighting and havdalah times.
 */
import { DEFAULT_JEWISH_SETTINGS, type Collection } from "../events/schema";
import type { Range } from "../events/expand";
import { jewishHolidays } from "./jewish";
import { shabbatTimes } from "../zmanim/shabbat";
import { parashot } from "./parasha";
import { omerDays, specialShabbatot, SPECIAL_NAMES } from "./extras";
import type { HolidayOccurrence } from "./types";

export function computedOccurrences(c: Collection, range: Range): HolidayOccurrence[] {
  if (c.kind !== "jewish") return [];
  const s = c.jewish ?? DEFAULT_JEWISH_SETTINGS;
  const out = jewishHolidays.occurrences(range, { region: s.region, categories: s.categories });
  const has = (c: string) => (s.categories as string[]).includes(c);
  if (has("parasha")) for (const r of parashot(range, s.region))
    out.push({ id: "parasha", epochDay: r.epochDay, set: "jewish", category: "parasha", yomTov: false, en: `Parashat ${r.en}`, he: `פרשת ${r.he}` });
  if (has("special")) for (const x of specialShabbatot(range, s.region))
    out.push({ id: `special-${x.id}`, epochDay: x.epochDay, set: "jewish", category: "special", yomTov: false, en: SPECIAL_NAMES[x.id][0], he: SPECIAL_NAMES[x.id][1] });
  if (has("omer")) for (const o of omerDays(range))
    out.push({ id: "omer", epochDay: o.epochDay, set: "jewish", category: "omer", yomTov: false, en: `Omer: day ${o.n}`, he: `ספירת העומר: ${hebrewNumber(o.n)} בעומר` });
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
  }
  out.sort((a, b) => a.epochDay - b.epochDay || (a.at ?? -1) - (b.at ?? -1));
  return out;
}

/** 1–49 in Hebrew numerals (ט״ו and ט״ז, not י״ה / י״ו). */
function hebrewNumber(n: number): string {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"], tens = ["", "י", "כ", "ל", "מ"];
  const s = n === 15 ? "טו" : n === 16 ? "טז" : tens[Math.floor(n / 10)] + ones[n % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}
