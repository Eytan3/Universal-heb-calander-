import { describe, expect, it } from "vitest";
import ref from "./fixtures/zmanim-hebcal.json";
import { sunsetMs, tzeitMs, candleLightingMs, roundToMinute } from "@/core/zmanim/sun";
import { shabbatTimes } from "@/core/zmanim/shabbat";
import { gregorian } from "@/core/calendars/gregorian";
import { emptyDocument, validateJewishSettings, JEWISH_COLLECTION_ID } from "@/core/events/schema";
import { changeCollection } from "@/core/events/store";
import { computedOccurrences } from "@/core/holidays/computed";
import { buildCollectionsIcs } from "@/core/export/ics";
import { cityById, CITIES } from "@/core/zmanim/cities";

/**
 * tests/fixtures/zmanim-hebcal.json is produced by scripts/zmanim-reference.mjs from @hebcal/core:
 * sunset / tzeit every 3 days for two years, and every candle-lighting and havdalah event Hebcal lists,
 * for 7 places (Israel and abroad) and two havdalah methods.
 */
type Place = { id: string; lat: number; lon: number; il: boolean; candle: number;
  sun: { date: string; sunset: number; tzeit85: number }[]; events: { kind: string; type: string; date: string; at: number }[] };
const places = (ref as { places: Place[] }).places;
const dayOf = (s: string) => { const [y, m, d] = s.split("-"); return gregorian.toEpochDay({ year: +y, monthCode: `M${m}`, day: +d }); };
const iso = (d: number) => { const g = gregorian.fromEpochDay(d); return `${g.year}-${g.monthCode.slice(1)}-${String(g.day).padStart(2, "0")}`; };

describe("sunset and nightfall (our NOAA implementation vs Hebcal)", () => {
  for (const p of places) {
    it(`${p.id}: within a second, and the same minute every day`, () => {
      for (const s of p.sun) {
        const day = dayOf(s.date);
        const ours = sunsetMs(day, p.lat, p.lon), night = tzeitMs(day, p.lat, p.lon);
        expect(Math.abs(ours - s.sunset)).toBeLessThanOrEqual(1000);
        expect(Math.abs(night - s.tzeit85)).toBeLessThanOrEqual(1000);
        expect(candleLightingMs(ours, p.candle)).toBe(candleLightingMs(s.sunset, p.candle));
        expect(roundToMinute(night)).toBe(roundToMinute(s.tzeit85));
      }
    });
  }
});

describe("candle lighting and havdalah: every Shabbat and festival for two years, as Hebcal lists them", () => {
  for (const p of places) for (const kind of ["deg", "min50"] as const) {
    it(`${p.id}, havdalah ${kind === "deg" ? "at 8.5°" : "50 minutes"}`, () => {
      const expected = p.events.filter((e) => e.kind === kind).map((e) => `${e.type} ${e.date} ${new Date(e.at).toISOString()}`).sort();
      const ours = shabbatTimes({ start: dayOf("2026-09-01"), end: dayOf("2028-09-30") + 1 }, {
        lat: p.lat, lon: p.lon, region: p.il ? "il" : "diaspora", candleMinutes: p.candle,
        havdalah: kind === "deg" ? { degrees: 8.5 } : { minutes: 50 },
      }).map((e) => `${e.kind} ${iso(e.epochDay)} ${new Date(e.at).toISOString()}`).sort();
      expect(ours).toEqual(expected);
    });
  }
});

describe("Shabbat times inside a computed calendar", () => {
  const jlm = cityById("jerusalem")!;
  const settings = { region: "il" as const, categories: ["major" as const], zmanim: {
    place: { name: "ירושלים", lat: jlm.lat, lon: jlm.lon, tz: jlm.tz, cityId: jlm.id }, candleMinutes: 40, havdalah: { degrees: 8.5 } } };

  it("settings are validated", () => {
    expect(validateJewishSettings(settings).ok).toBe(true);
    expect(validateJewishSettings({ ...settings, zmanim: { ...settings.zmanim, candleMinutes: 200 } }).ok).toBe(false);
    expect(validateJewishSettings({ ...settings, zmanim: { ...settings.zmanim, place: { ...settings.zmanim.place, lat: 80 } } }).ok).toBe(false);
    expect(validateJewishSettings({ ...settings, zmanim: { ...settings.zmanim, havdalah: { minutes: 5 } } }).ok).toBe(false);
    expect(validateJewishSettings({ ...settings, zmanim: { ...settings.zmanim, place: { ...settings.zmanim.place, tz: "Nowhere/City" } } }).ok).toBe(false);
  });

  it("entries appear with exact times; .ics carries them as UTC moments", () => {
    const doc = emptyDocument();
    changeCollection(doc, JEWISH_COLLECTION_ID, { name: "", color: "#5e35b1", jewish: settings });
    const fri = dayOf("2027-03-05");
    const entries = computedOccurrences(doc.collections[1], { start: fri, end: fri + 2 });
    const candles = entries.find((e) => e.id === "candles")!;
    const havdalah = entries.find((e) => e.id === "havdalah")!;
    expect(candles.epochDay).toBe(fri);
    expect(havdalah.epochDay).toBe(fri + 1);
    expect(candles.at).toBe(candleLightingMs(sunsetMs(fri, jlm.lat, jlm.lon), 40));
    const ics = buildCollectionsIcs(doc, [JEWISH_COLLECTION_ID], { range: { start: fri, end: fri + 2 }, calendarName: "x", locale: "he" }).replace(/\r\n /g, "");
    const stamp = new Date(candles.at!).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    expect(ics).toContain(`UID:holiday.candles.20270305@`);
    expect(ics).toContain(`DTSTART:${stamp}`);
    expect(ics).toContain("SUMMARY:🕯️ הדלקת נרות");
    expect(ics).toContain("SUMMARY:🍷 הבדלה");
  });

  it("the city list uses the customary minutes", () => {
    expect(cityById("jerusalem")!.candle).toBe(40);
    expect(cityById("haifa")!.candle).toBe(30);
    expect(cityById("tel-aviv")!.candle).toBe(20);
    expect(cityById("new-york")!.candle).toBe(18);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
  });
});
