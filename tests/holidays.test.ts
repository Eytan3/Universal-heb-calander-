/**
 * Our rule-based holidays vs Hebcal (@hebcal/core, a dev-only oracle) — every holiday we
 * define, every Hebrew year 5710–5899, Israel and diaspora. Any difference fails the test.
 */
import { describe, expect, it } from "vitest";
import { HebrewCalendar } from "@hebcal/core";
import { hebrew } from "@/core/calendars/registry";
import { HOLIDAY_CATEGORIES, jewishHolidays, type HolidayCategory } from "@/core/holidays/registry";
import { RATA_DIE_OF_EPOCH } from "@/core/time/epochDay";

const FIRST = 5710, LAST = 5899;
const range = {
  start: hebrew.toEpochDay({ year: FIRST, monthCode: "M01", day: 1 }),
  end: hebrew.toEpochDay({ year: LAST + 1, monthCode: "M01", day: 1 }),
};

function normalise(desc: string): string {
  return desc.replace(/^Rosh Hashana \d{4}$/, "Rosh Hashana").replace(/ \(observed\)$/, "");
}

function hebcalPairs(il: boolean, names: Set<string>): Set<string> {
  const out = new Set<string>();
  for (let y = FIRST - 1; y <= LAST + 1; y++) {
    const evs = HebrewCalendar.calendar({
      year: y, isHebrewYear: true, il, noSpecialShabbat: true, sedrot: false, omer: false, candlelighting: false,
    });
    for (const e of evs) {
      const name = normalise(e.getDesc());
      const day = e.getDate().abs() - RATA_DIE_OF_EPOCH;
      if (names.has(name) && day >= range.start && day < range.end) out.add(`${day}|${name}`);
    }
  }
  return out;
}

describe.each([["Israel", "il"], ["diaspora", "diaspora"]] as const)("Jewish holidays — %s", (_label, region) => {
  const ours = jewishHolidays.occurrences(range, { region, categories: HOLIDAY_CATEGORIES });
  const names = new Set(ours.map((o) => o.en));
  const ourPairs = new Set(ours.map((o) => `${o.epochDay}|${o.en}`));
  const theirs = hebcalPairs(region === "il", names);

  it("every holiday we define exists in Hebcal under the same name", () => {
    const hebcalNames = new Set([...theirs].map((p) => p.split("|")[1]));
    expect([...names].filter((n) => !hebcalNames.has(n))).toEqual([]);
  });

  it("matches Hebcal on every date, 5710–5899", () => {
    const fmt = (p: string) => {
      const [d, n] = p.split("|");
      const h = hebrew.fromEpochDay(Number(d));
      return `${n} @ ${h.day} ${h.monthCode} ${h.year}`;
    };
    const missing = [...theirs].filter((p) => !ourPairs.has(p)).map(fmt);
    const extra = [...ourPairs].filter((p) => !theirs.has(p)).map(fmt);
    expect({ missing: missing.slice(0, 15), extra: extra.slice(0, 15), counts: [missing.length, extra.length] })
      .toEqual({ missing: [], extra: [], counts: [0, 0] });
    expect(ourPairs.size).toBeGreaterThan(190 * 70);
  });
});

describe("holiday options", () => {
  const year = { start: hebrew.toEpochDay({ year: 5787, monthCode: "M01", day: 1 }), end: hebrew.toEpochDay({ year: 5788, monthCode: "M01", day: 1 }) };
  it("no categories → a clean calendar", () => {
    expect(jewishHolidays.occurrences(year, { region: "il", categories: [] })).toEqual([]);
  });
  it("each category can be shown on its own", () => {
    for (const c of HOLIDAY_CATEGORIES) {
      const occ = jewishHolidays.occurrences(year, { region: "il", categories: [c as HolidayCategory] });
      expect(occ.length).toBeGreaterThan(0);
      expect(occ.every((o) => o.category === c)).toBe(true);
    }
  });
  it("diaspora adds second festival days; Israel does not", () => {
    const il = jewishHolidays.occurrences(year, { region: "il", categories: ["major"] }).map((o) => o.en);
    const dia = jewishHolidays.occurrences(year, { region: "diaspora", categories: ["major"] }).map((o) => o.en);
    expect(dia).toContain("Pesach VIII");
    expect(dia).toContain("Simchat Torah");
    expect(il).not.toContain("Pesach VIII");
  });
  it("Hebrew names are provided", () => {
    const occ = jewishHolidays.occurrences(year, { region: "il", categories: ["major"] });
    expect(occ.find((o) => o.id === "pesach-1")!.he).toBe("פסח א׳");
  });
});
