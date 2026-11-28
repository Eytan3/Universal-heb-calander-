/**
 * Jewish holidays as calendar-native RULES, evaluated by our own Hebrew calendar engine.
 *
 * Nothing here calls a holiday library at runtime. Each holiday is a Hebrew date
 * (month code + day, Temporal/RFC 7529 conventions) plus, where halacha or Israeli
 * law moves the observance, a small named shift rule. The rules are verified in
 * tests/holidays.test.ts against Hebcal for every year from 5710 to 5900, in Israel
 * and in the diaspora. English names follow Hebcal's transliterations.
 *
 * Adar: "M06" is Adar in a common year and Adar II in a leap year (Purim etc.);
 * "M05L" is Adar I and exists only in leap years (Purim Katan).
 */
import { hebrew } from "../calendars/hebrew";
import type { EpochDay } from "../time/epochDay";
import { weekdayOf } from "../time/epochDay";
import type { HolidayCategory, HolidayOccurrence, HolidayOptions, HolidaySet } from "./types";

const SUN = 0, MON = 1, FRI = 5, SAT = 6;

type ShiftRule =
  | "fast-sat-to-sun"      // Tzom Gedaliah, 17 Tammuz, Tish'a B'Av: a fast on Shabbat is postponed to Sunday
  | "fast-sat-to-thu"      // Ta'anit Esther, Ta'anit Bechorot (and the Sigd): on Shabbat, moved back to Thursday
  | "erev-tisha-bav"       // the day before the (possibly postponed) fast
  | "yom-hashoah"          // 27 Nisan; Friday → Thursday, Sunday → Monday
  | "yom-hazikaron"        // follows Yom HaAtzma'ut
  | "yom-haatzmaut"        // 5 Iyyar; Fri/Sat → preceding Thursday; Monday → Tuesday (from 5764)
  | "leil-selichot";       // the last Saturday night at least 4 days before Rosh Hashana

interface HolidayDef {
  id: string;
  en: string;
  he: string;
  category: HolidayCategory;
  month: string;
  day: number;
  /** Days added after resolving month/day (multi-day festivals such as Chanukah). */
  offset?: number;
  region?: "il" | "diaspora";
  shift?: ShiftRule;
  /** First Hebrew year in which the day is observed. */
  since?: number;
  /** A day of rest (Yom Tov). */
  yomTov?: boolean;
}

const D = (id: string, en: string, he: string, category: HolidayCategory, month: string, day: number, extra: Partial<HolidayDef> = {}): HolidayDef =>
  ({ id, en, he, category, month, day, ...extra });

const HEB_ORD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ז׳", "ח׳"];
const EN_ORD = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function festivalDays(key: "Sukkot" | "Pesach", heName: string, month: string, startDay: number): HolidayDef[] {
  const out: HolidayDef[] = [];
  for (let i = 0; i < 7; i++) {
    const day = startDay + i;
    const last = i === 6;
    // Israel: day 1 Yom Tov, days 2–6 Chol HaMoed, day 7 (Sukkot: Hoshana Raba; Pesach: Yom Tov)
    let enIl = `${key} ${EN_ORD[i]}${i > 0 && !last ? " (CH''M)" : ""}`;
    let heIl = `${heName} ${HEB_ORD[i]}${i > 0 && !last ? " (חוה״מ)" : ""}`;
    if (key === "Sukkot" && last) { enIl = "Sukkot VII (Hoshana Raba)"; heIl = "סוכות ז׳ (הושענא רבה)"; }
    const yomTovIl = i === 0 || (key === "Pesach" && last);
    if (i === 1) {
      out.push(D(`${key.toLowerCase()}-${i + 1}-il`, enIl, heIl, "major", month, day, { region: "il" }));
      out.push(D(`${key.toLowerCase()}-${i + 1}-dia`, `${key} II`, `${heName} ב׳`, "major", month, day, { region: "diaspora", yomTov: true }));
    } else {
      out.push(D(`${key.toLowerCase()}-${i + 1}`, enIl, heIl, "major", month, day, { yomTov: yomTovIl }));
    }
  }
  return out;
}

const DEFS: HolidayDef[] = [
  // ── Tishrei ──
  D("rosh-hashana-1", "Rosh Hashana", "ראש השנה", "major", "M01", 1, { yomTov: true }),
  D("rosh-hashana-2", "Rosh Hashana II", "ראש השנה ב׳", "major", "M01", 2, { yomTov: true }),
  D("tzom-gedaliah", "Tzom Gedaliah", "צום גדליה", "fast", "M01", 3, { shift: "fast-sat-to-sun" }),
  D("erev-yom-kippur", "Erev Yom Kippur", "ערב יום כיפור", "major", "M01", 9),
  D("yom-kippur", "Yom Kippur", "יום כיפור", "major", "M01", 10, { yomTov: true }),
  D("erev-sukkot", "Erev Sukkot", "ערב סוכות", "major", "M01", 14),
  ...festivalDays("Sukkot", "סוכות", "M01", 15),
  D("shmini-atzeret", "Shmini Atzeret", "שמיני עצרת", "major", "M01", 22, { yomTov: true }),
  D("simchat-torah", "Simchat Torah", "שמחת תורה", "major", "M01", 23, { region: "diaspora", yomTov: true }),
  // ── Cheshvan ──
  D("sigd", "Sigd", "חג הסיגד", "modern", "M02", 29, { since: 5769, shift: "fast-sat-to-thu" }), // Shabbat → Thursday
  // ── Kislev / Tevet: Chanukah candles are lit on the evening of the listed day ──
  ...Array.from({ length: 8 }, (_, i) =>
    D(`chanukah-${i + 1}`, `Chanukah: ${i + 1} Candle${i ? "s" : ""}`, `חנוכה: ${HEB_ORD[i]} ${i ? "נרות" : "נר"}`, "minor", "M03", 24, { offset: i })),
  D("chanukah-8th-day", "Chanukah: 8th Day", "חנוכה: יום ח׳", "minor", "M03", 24, { offset: 8 }),
  D("asara-btevet", "Asara B'Tevet", "עשרה בטבת", "fast", "M04", 10),
  // ── Shevat / Adar ──
  D("tu-bishvat", "Tu BiShvat", "ט״ו בשבט", "minor", "M05", 15),
  D("purim-katan", "Purim Katan", "פורים קטן", "minor", "M05L", 14),
  D("shushan-purim-katan", "Shushan Purim Katan", "שושן פורים קטן", "minor", "M05L", 15),
  D("taanit-esther", "Ta'anit Esther", "תענית אסתר", "fast", "M06", 13, { shift: "fast-sat-to-thu" }),
  D("erev-purim", "Erev Purim", "ערב פורים", "minor", "M06", 13),
  D("purim", "Purim", "פורים", "minor", "M06", 14),
  D("shushan-purim", "Shushan Purim", "שושן פורים", "minor", "M06", 15),
  // ── Nisan ──
  D("taanit-bechorot", "Ta'anit Bechorot", "תענית בכורות", "fast", "M07", 14, { shift: "fast-sat-to-thu" }),
  D("erev-pesach", "Erev Pesach", "ערב פסח", "major", "M07", 14),
  ...festivalDays("Pesach", "פסח", "M07", 15),
  D("pesach-8", "Pesach VIII", "פסח ח׳", "major", "M07", 22, { region: "diaspora", yomTov: true }),
  D("yom-hashoah", "Yom HaShoah", "יום השואה", "modern", "M07", 27, { shift: "yom-hashoah", since: 5711 }),
  // ── Iyyar ──
  D("yom-hazikaron", "Yom HaZikaron", "יום הזיכרון", "modern", "M08", 4, { shift: "yom-hazikaron", since: 5709 }),
  D("yom-haatzmaut", "Yom HaAtzma'ut", "יום העצמאות", "modern", "M08", 5, { shift: "yom-haatzmaut", since: 5708 }),
  D("pesach-sheni", "Pesach Sheni", "פסח שני", "minor", "M08", 14),
  D("lag-baomer", "Lag BaOmer", "ל״ג בעומר", "minor", "M08", 18),
  D("yom-yerushalayim", "Yom Yerushalayim", "יום ירושלים", "modern", "M08", 28, { since: 5727 }),
  // ── Sivan ──
  D("erev-shavuot", "Erev Shavuot", "ערב שבועות", "major", "M09", 5),
  D("shavuot-il", "Shavuot", "שבועות", "major", "M09", 6, { region: "il", yomTov: true }),
  D("shavuot-1", "Shavuot I", "שבועות א׳", "major", "M09", 6, { region: "diaspora", yomTov: true }),
  D("shavuot-2", "Shavuot II", "שבועות ב׳", "major", "M09", 7, { region: "diaspora", yomTov: true }),
  // ── Tammuz / Av / Elul ──
  D("tzom-tammuz", "Tzom Tammuz", "צום י״ז בתמוז", "fast", "M10", 17, { shift: "fast-sat-to-sun" }),
  D("erev-tisha-bav", "Erev Tish'a B'Av", "ערב תשעה באב", "fast", "M11", 9, { shift: "erev-tisha-bav" }),
  D("tisha-bav", "Tish'a B'Av", "תשעה באב", "fast", "M11", 9, { shift: "fast-sat-to-sun" }),
  D("tu-bav", "Tu B'Av", "ט״ו באב", "minor", "M11", 15),
  D("rosh-hashana-labehemot", "Rosh Hashana LaBehemot", "ראש השנה למעשר בהמה", "minor", "M12", 1),
  D("leil-selichot", "Leil Selichot", "סליחות", "minor", "M12", 1, { shift: "leil-selichot" }),
  D("erev-rosh-hashana", "Erev Rosh Hashana", "ערב ראש השנה", "major", "M12", 29),
];

/** Apply a shift rule to the nominal day. Returns the observed day. */
function applyShift(rule: ShiftRule, year: number, nominal: EpochDay): EpochDay {
  const wd = weekdayOf(nominal);
  switch (rule) {
    case "fast-sat-to-sun":
      return wd === SAT ? nominal + 1 : nominal;
    case "fast-sat-to-thu":
      return wd === SAT ? nominal - 2 : nominal;
    case "erev-tisha-bav":
      // Nominal is 9 Av; Erev is the day before the observed fast.
      return applyShift("fast-sat-to-sun", year, nominal) - 1;
    case "yom-hashoah":
      return wd === FRI ? nominal - 1 : wd === SUN ? nominal + 1 : nominal;
    case "yom-haatzmaut":
      if (wd === FRI) return nominal - 1;
      if (wd === SAT) return nominal - 2;
      if (wd === MON && year >= 5764) return nominal + 1;
      return nominal;
    case "yom-hazikaron": {
      // Always the day before Yom HaAtzma'ut (nominal here is 4 Iyyar = 5 Iyyar − 1).
      return applyShift("yom-haatzmaut", year, nominal + 1) - 1;
    }
    case "leil-selichot": {
      const roshHashana = hebrew.toEpochDay({ year: year + 1, monthCode: "M01", day: 1 });
      let d = roshHashana - 1;
      while (weekdayOf(d) !== SAT || roshHashana - d < 4) d--;
      return d;
    }
  }
}

function roshChodesh(year: number, options: HolidayOptions): HolidayOccurrence[] {
  const out: HolidayOccurrence[] = [];
  const months = hebrew.monthsInYear(year);
  months.forEach((m, i) => {
    if (m.monthCode === "M01") return; // Rosh Hashana, not Rosh Chodesh
    const en = `Rosh Chodesh ${hebrew.monthName({ year, monthCode: m.monthCode }, "en")}`;
    const he = `ראש חודש ${hebrew.monthName({ year, monthCode: m.monthCode }, "he")}`;
    const first = hebrew.toEpochDay({ year, monthCode: m.monthCode, day: 1 });
    const prev = months[i - 1];
    const days = prev.days === 30 ? [first - 1, first] : [first];
    for (const d of days) out.push({ id: `rosh-chodesh-${m.monthCode}`, epochDay: d, en, he, category: "roshchodesh", yomTov: false, set: "jewish" });
    // Chag HaBanot is observed on the first day of Rosh Chodesh Tevet.
    if (m.monthCode === "M04" && options.categories.includes("minor"))
      out.push({ id: "chag-habanot", epochDay: days[0], en: "Chag HaBanot", he: "חג הבנות", category: "minor", yomTov: false, set: "jewish" });
  });
  return out;
}

function occurrencesForYear(year: number, options: HolidayOptions): HolidayOccurrence[] {
  const out: HolidayOccurrence[] = [];
  for (const def of DEFS) {
    if (!options.categories.includes(def.category)) continue;
    if (def.region && def.region !== options.region) continue;
    if (def.since && year < def.since) continue;
    if (hebrew.daysInMonth(year, def.month) === null) continue; // e.g. Purim Katan in a common year
    let day = hebrew.toEpochDay({ year, monthCode: def.month, day: def.day }) + (def.offset ?? 0);
    if (def.shift) day = applyShift(def.shift, year, day);
    out.push({ id: def.id, epochDay: day, en: def.en, he: def.he, category: def.category, yomTov: Boolean(def.yomTov), set: "jewish" });
  }
  if (options.categories.includes("roshchodesh") || options.categories.includes("minor")) {
    const rc = roshChodesh(year, options);
    out.push(...rc.filter((o) => options.categories.includes(o.category as HolidayCategory)));
  }
  return out;
}

export const jewishHolidays: HolidaySet = {
  id: "jewish",
  name: { en: "Jewish holidays", he: "חגים ומועדים" },
  calendar: "hebrew",
  occurrences(range, options) {
    if (options.categories.length === 0) return [];
    const lo = hebrew.fromEpochDay(range.start).year - 1;
    const hi = hebrew.fromEpochDay(range.end).year + 1;
    const out: HolidayOccurrence[] = [];
    for (let y = Math.max(lo, hebrew.minYear); y <= Math.min(hi, hebrew.maxYear - 1); y++) {
      for (const o of occurrencesForYear(y, options)) if (o.epochDay >= range.start && o.epochDay < range.end) out.push(o);
    }
    return out.sort((a, b) => a.epochDay - b.epochDay);
  },
};
