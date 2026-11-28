/**
 * Sunset and nightfall (tzeit) — NOAA's solar position algorithm (Meeus), the same public formulas used by
 * NOAA's calculator, KosherJava and Hebcal. Our own implementation (no runtime library), verified against
 * @hebcal/core in the tests.
 *
 * Times are minutes after 00:00 UTC of the given Gregorian date (may exceed 1440 far west of Greenwich).
 * Sea level, as Hebcal does by default for candle lighting and havdalah.
 */
import { gregorian } from "../calendars/gregorian";
import type { EpochDay } from "../time/epochDay";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Zenith of the sun's centre at sunset: 90° + refraction (34′) + solar radius (16′). */
export const SUNSET_ZENITH = 90 + 50 / 60;

function julianDay(day: EpochDay): number {
  // 1970-01-01 00:00 UTC = JD 2440587.5
  return day + 2440587.5;
}
const centuries = (jd: number) => (jd - 2451545) / 36525;

function meanLongitude(t: number) {
  let l = 280.46646 + t * (36000.76983 + 0.0003032 * t);
  l %= 360;
  return l < 0 ? l + 360 : l;
}
const meanAnomaly = (t: number) => 357.52911 + t * (35999.05029 - 0.0001537 * t);
const eccentricity = (t: number) => 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
function equationOfCenter(t: number) {
  const m = rad(meanAnomaly(t));
  return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
}
function apparentLongitude(t: number) {
  const omega = 125.04 - 1934.136 * t;
  return meanLongitude(t) + equationOfCenter(t) - 0.00569 - 0.00478 * Math.sin(rad(omega));
}
function obliquity(t: number) {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23 + (26 + seconds / 60) / 60;
  return e0 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * t));
}
function declination(t: number) {
  return deg(Math.asin(Math.sin(rad(obliquity(t))) * Math.sin(rad(apparentLongitude(t)))));
}
/** Equation of time, minutes. */
function equationOfTime(t: number) {
  const e = obliquity(t), l0 = rad(meanLongitude(t)), ecc = eccentricity(t), m = rad(meanAnomaly(t));
  const y = Math.tan(rad(e) / 2) ** 2;
  const eq = y * Math.sin(2 * l0) - 2 * ecc * Math.sin(m) + 4 * ecc * y * Math.sin(m) * Math.cos(2 * l0)
    - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * ecc * ecc * Math.sin(2 * m);
  return deg(eq) * 4;
}
/** Hour angle (radians) of the sun at `zenith` in the evening; NaN when it never gets there (polar). */
function eveningHourAngle(lat: number, decl: number, zenith: number) {
  const la = rad(lat), d = rad(decl);
  return Math.acos(Math.cos(rad(zenith)) / (Math.cos(la) * Math.cos(d)) - Math.tan(la) * Math.tan(d));
}

/**
 * Minutes after 00:00 UTC on `day` when the sun's centre reaches `zenith` in the evening
 * (two passes: first at solar noon, then at the first estimate). NaN if it does not happen.
 * `lon`: degrees east positive.
 */
export function eveningUtcMinutes(day: EpochDay, lat: number, lon: number, zenith: number = SUNSET_ZENITH): number {
  const jd = julianDay(day);
  const noon = 720 - 4 * lon - equationOfTime(centuries(jd + (720 - 4 * lon) / 1440));
  let at = noon;
  for (let pass = 0; pass < 2; pass++) {
    const t = centuries(jd + at / 1440);
    const ha = eveningHourAngle(lat, declination(t), zenith);
    if (Number.isNaN(ha)) return NaN;
    at = 720 - 4 * (lon - deg(ha)) - equationOfTime(t);
  }
  return at;
}

/** Instant (ms) of sunset on `day` at the place. */
export function sunsetMs(day: EpochDay, lat: number, lon: number): number {
  const g = gregorian.fromEpochDay(day);
  const midnight = Date.UTC(g.year, Number(g.monthCode.slice(1)) - 1, g.day);
  return midnight + eveningUtcMinutes(day, lat, lon) * 60000;
}

/** Instant (ms) when the sun is `depression`° below the horizon in the evening (tzeit; 8.5° by default). */
export function tzeitMs(day: EpochDay, lat: number, lon: number, depression = 8.5): number {
  const g = gregorian.fromEpochDay(day);
  const midnight = Date.UTC(g.year, Number(g.monthCode.slice(1)) - 1, g.day);
  return midnight + eveningUtcMinutes(day, lat, lon, 90 + depression) * 60000;
}

// ── Rounding exactly as Hebcal does, so times match it to the minute ──

/** Candle lighting: sunset with its seconds dropped, minus `minutes`. */
export function candleLightingMs(sunset: number, minutes: number): number {
  return Math.floor(sunset / 60000) * 60000 - minutes * 60000;
}
/** Havdalah N minutes after sunset: like candle lighting, but a sunset at :30 s or later counts as the next minute. */
export function havdalahMinutesMs(sunset: number, minutes: number): number {
  const s = new Date(sunset).getUTCSeconds();
  return Math.floor(sunset / 60000) * 60000 + (minutes + (s >= 30 ? 1 : 0)) * 60000;
}
/** Any other moment: to the nearest minute (30 s rounds up). */
export function roundToMinute(ms: number): number {
  return Math.round(ms / 60000) * 60000;
}
