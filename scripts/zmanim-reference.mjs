// Dev-only: writes tests/fixtures/zmanim-hebcal.json — Hebcal's sunset / tzeit and its candle-lighting and
// havdalah events for several places, used to verify our own implementation minute for minute.
//   node scripts/zmanim-reference.mjs
import { writeFileSync } from "node:fs";
import { HebrewCalendar, Location, Zmanim } from "@hebcal/core";

const places = [
  { id: "jerusalem", lat: 31.778, lon: 35.235, tz: "Asia/Jerusalem", il: true, candle: 40 },
  { id: "tel-aviv", lat: 32.0853, lon: 34.7818, tz: "Asia/Jerusalem", il: true, candle: 20 },
  { id: "haifa", lat: 32.794, lon: 34.9896, tz: "Asia/Jerusalem", il: true, candle: 30 },
  { id: "new-york", lat: 40.7128, lon: -74.006, tz: "America/New_York", il: false, candle: 18 },
  { id: "los-angeles", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles", il: false, candle: 18 },
  { id: "london", lat: 51.5074, lon: -0.1278, tz: "Europe/London", il: false, candle: 18 },
  { id: "melbourne", lat: -37.8136, lon: 144.9631, tz: "Australia/Melbourne", il: false, candle: 18 },
];
const out = { generatedWith: "@hebcal/core", places: [] };
for (const p of places) {
  const loc = new Location(p.lat, p.lon, p.il, p.tz, p.id, p.il ? "IL" : "XX");
  const sun = [];
  for (let i = 0; i < 366 * 2; i += 3) {
    const d = new Date(2026, 8, 1 + i);
    const z = new Zmanim(loc, d, false);
    sun.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      sunset: z.sunset().getTime(), tzeit85: z.tzeit(8.5).getTime() });
  }
  const events = [];
  for (const [opts, kind] of [[{ havdalahDeg: 8.5 }, "deg"], [{ havdalahMins: 50 }, "min50"]]) {
    const evs = HebrewCalendar.calendar({
      start: new Date(2026, 8, 1), end: new Date(2028, 8, 30), location: loc, il: p.il,
      candlelighting: true, candleLightingMins: p.candle, noHolidays: false, ...opts,
    });
    for (const e of evs) {
      const desc = e.getDesc();
      if (desc !== "Candle lighting" && desc !== "Havdalah") continue;
      const d = e.getDate().greg();
      events.push({ kind, type: desc === "Candle lighting" ? "candles" : "havdalah",
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        at: e.eventTime.getTime() });
    }
  }
  out.places.push({ ...p, sun, events });
}
writeFileSync(new URL("../tests/fixtures/zmanim-hebcal.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(out.places.map((p) => `${p.id}: ${p.sun.length} days, ${p.events.length} events`).join("\n"));
