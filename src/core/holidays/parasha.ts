/**
 * The weekly Torah portion (parashat hashavua), Israel or diaspora — our own rules, verified against Hebcal
 * for 60 years. A portion is read on every Shabbat that is not a festival or Chol HaMoed. Fixed points:
 *   Bereshit right after Simchat Torah · in a common year Tzav on the last Shabbat before Pesach ·
 *   Bamidbar before Shavuot · Devarim before (or on) Tisha B'Av · Nitzavim before Rosh Hashana.
 * Between fixed points the portions follow in order; when there are fewer Shabbatot than portions, pairs are
 * read together (Vayakhel-Pekudei, Tazria-Metzora, Acharei Mot-Kedoshim, Behar-Bechukotai, Chukat-Balak,
 * Matot-Masei, Nitzavim-Vayeilech) in their customary order of preference.
 */
import { hebrew } from "../calendars/hebrew";
import type { Range } from "../events/expand";
import { weekdayOf, type EpochDay } from "../time/epochDay";

/** [English (Hebcal spelling), Hebrew]. Index = position in the Torah. */
export const PARSHIOT: [string, string][] = [
  ["Bereshit", "בראשית"], ["Noach", "נח"], ["Lech-Lecha", "לך לך"], ["Vayera", "וירא"], ["Chayei Sara", "חיי שרה"],
  ["Toldot", "תולדות"], ["Vayetzei", "ויצא"], ["Vayishlach", "וישלח"], ["Vayeshev", "וישב"], ["Miketz", "מקץ"],
  ["Vayigash", "ויגש"], ["Vayechi", "ויחי"], ["Shemot", "שמות"], ["Vaera", "וארא"], ["Bo", "בא"], ["Beshalach", "בשלח"],
  ["Yitro", "יתרו"], ["Mishpatim", "משפטים"], ["Terumah", "תרומה"], ["Tetzaveh", "תצוה"], ["Ki Tisa", "כי תשא"],
  ["Vayakhel", "ויקהל"], ["Pekudei", "פקודי"], ["Vayikra", "ויקרא"], ["Tzav", "צו"], ["Shmini", "שמיני"],
  ["Tazria", "תזריע"], ["Metzora", "מצורע"], ["Achrei Mot", "אחרי מות"], ["Kedoshim", "קדושים"], ["Emor", "אמור"],
  ["Behar", "בהר"], ["Bechukotai", "בחקתי"], ["Bamidbar", "במדבר"], ["Nasso", "נשא"], ["Beha'alotcha", "בהעלתך"],
  ["Sh'lach", "שלח"], ["Korach", "קרח"], ["Chukat", "חקת"], ["Balak", "בלק"], ["Pinchas", "פינחס"], ["Matot", "מטות"],
  ["Masei", "מסעי"], ["Devarim", "דברים"], ["Vaetchanan", "ואתחנן"], ["Eikev", "עקב"], ["Re'eh", "ראה"],
  ["Shoftim", "שופטים"], ["Ki Teitzei", "כי תצא"], ["Ki Tavo", "כי תבוא"], ["Nitzavim", "נצבים"], ["Vayeilech", "וילך"],
  ["Ha'azinu", "האזינו"],
];
const P = (en: string) => PARSHIOT.findIndex(([e]) => e === en);
const BERESHIT = 0, TZAV = P("Tzav"), BAMIDBAR = P("Bamidbar"), DEVARIM = P("Devarim"), NITZAVIM = P("Nitzavim"),
  VAYEILECH = P("Vayeilech"), HAAZINU = P("Ha'azinu");

/** Pairs that may be joined, each as the index of its first portion, in order of preference per stretch. */
const JOINABLE: Record<string, number[]> = {
  beforePesach: [P("Vayakhel")],
  beforeShavuot: [P("Tazria"), P("Achrei Mot"), P("Behar")],
  beforeTishaBav: [P("Matot"), P("Chukat")],
  beforeRoshHashana: [P("Nitzavim")],
};

export interface Reading {
  epochDay: EpochDay;
  /** One portion, or two read together. */
  parts: number[];
  en: string;
  he: string;
}

const SATURDAY = 6;
const md = (year: number, monthCode: string, day: number) => hebrew.toEpochDay({ year, monthCode, day });

/** Festival / Chol HaMoed days on which no weekly portion is read. */
function holidayDays(year: number, il: boolean): Set<EpochDay> {
  const s = new Set<EpochDay>();
  const add = (m: string, from: number, to: number) => { for (let d = from; d <= to; d++) s.add(md(year, m, d)); };
  add("M01", 1, 2); add("M01", 10, 10); add("M01", 15, il ? 22 : 23); // Rosh Hashana, Yom Kippur, Sukkot … Shemini Atzeret / Simchat Torah
  add("M07", 15, il ? 21 : 22); // Pesach
  add("M09", 6, il ? 6 : 7); // Shavuot
  return s;
}

const shabbatOnOrAfter = (d: EpochDay) => d + ((SATURDAY - weekdayOf(d) + 7) % 7);

/** Free Shabbatot (not festivals) from Rosh Hashana to the end of the festival season. */
function freeShabbatot(year: number, il: boolean): EpochDay[] {
  const holidays = holidayDays(year, il);
  const out: EpochDay[] = [];
  for (let d = shabbatOnOrAfter(md(year, "M01", 1)), end = md(year + 1, "M01", 1); d < end; d += 7) if (!holidays.has(d)) out.push(d);
  return out;
}
const bereshitFrom = (year: number, il: boolean) => md(year, "M01", il ? 23 : 24);
/** Free Shabbatot in Tishrei before Bereshit: 2 → Vayeilech and Ha'azinu; 1 → only Ha'azinu. */
const tishreiSlots = (year: number, il: boolean) => freeShabbatot(year, il).filter((d) => d < bereshitFrom(year, il)).length;

/** Readings for the Shabbatot of one Hebrew year (Rosh Hashana to Rosh Hashana). */
function yearReadings(year: number, il: boolean): Reading[] {
  const free = freeShabbatot(year, il);
  const out: { day: EpochDay; parts: number[] }[] = [];

  // ── Tishrei, before Bereshit. Vayeilech is read now unless it was joined to Nitzavim before Rosh Hashana,
  // which happens exactly when this Tishrei has room for only one portion.
  const pre = free.filter((d) => d < bereshitFrom(year, il));
  const tishrei = pre.length >= 2 ? [VAYEILECH, HAAZINU] : [HAAZINU];
  pre.forEach((d, i) => { if (i < tishrei.length) out.push({ day: d, parts: [tishrei[i]] }); });

  // ── The rest of the year in stretches ending at fixed points.
  const rest = free.filter((d) => d >= bereshitFrom(year, il));
  const leap = hebrew.monthsInYear(year).length === 13;
  const lastBefore = (limit: EpochDay) => rest.filter((d) => d < limit).at(-1)!;
  const joinVayeilech = tishreiSlots(year + 1, il) < 2;
  // `exact`: the portion falls on that very Shabbat. Otherwise it is a deadline (Bamidbar is read *before*
  // Shavuot — in Israel, a week ahead of the diaspora after an eighth day of Pesach on Shabbat, Nasso may
  // already be read on the eve of Shavuot).
  const stops: { last: EpochDay; through: number; joinable: number[]; exact: boolean }[] = [];
  if (!leap) stops.push({ last: lastBefore(md(year, "M07", 15)), through: TZAV, joinable: JOINABLE.beforePesach, exact: true });
  stops.push({ last: lastBefore(md(year, "M09", 6)), through: BAMIDBAR, joinable: leap ? [...JOINABLE.beforePesach, ...JOINABLE.beforeShavuot] : JOINABLE.beforeShavuot, exact: false });
  // Devarim on the Shabbat before Tisha B'Av — or on 9 Av itself when it is Shabbat (the fast is postponed).
  stops.push({ last: lastBefore(md(year, "M11", 10)), through: DEVARIM, joinable: JOINABLE.beforeTishaBav, exact: true });
  stops.push({ last: rest.at(-1)!, through: joinVayeilech ? VAYEILECH : NITZAVIM, joinable: joinVayeilech ? JOINABLE.beforeRoshHashana : [], exact: true });

  let next = BERESHIT;
  let from = 0;
  for (const stop of stops) {
    const slots = rest.slice(from, rest.indexOf(stop.last) + 1);
    const portions = Array.from({ length: stop.through - next + 1 }, (_, i) => [next + i]);
    for (const first of stop.joinable) {
      if (portions.length <= slots.length) break;
      const i = portions.findIndex((q) => q[0] === first);
      if (i >= 0 && portions[i + 1]) portions.splice(i, 2, [...portions[i], ...portions[i + 1]]);
    }
    // A deadline that is met early leaves its remaining Shabbatot to the next stretch.
    const used = stop.exact ? slots.length : Math.min(slots.length, portions.length);
    slots.slice(0, used).forEach((d, i) => { if (portions[i]) out.push({ day: d, parts: portions[i] }); });
    from += used;
    next = stop.through + 1;
  }
  return out.map(({ day, parts }) => ({
    epochDay: day, parts,
    en: parts.map((i) => PARSHIOT[i][0]).join("-"),
    he: parts.map((i) => PARSHIOT[i][1]).join("–"),
  }));
}

const cache = new Map<string, Reading[]>();
function readingsOf(year: number, il: boolean): Reading[] {
  const k = `${year}${il ? "i" : "d"}`;
  let r = cache.get(k);
  if (!r) { r = yearReadings(year, il); cache.set(k, r); if (cache.size > 200) cache.clear(); }
  return r;
}

export function parashot(range: Range, region: "il" | "diaspora"): Reading[] {
  const il = region === "il";
  const first = hebrew.fromEpochDay(range.start).year, last = hebrew.fromEpochDay(range.end - 1).year;
  const out: Reading[] = [];
  for (let y = first; y <= last; y++) for (const r of readingsOf(y, il)) if (r.epochDay >= range.start && r.epochDay < range.end) out.push(r);
  return out;
}
