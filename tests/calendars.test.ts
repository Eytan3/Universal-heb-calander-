import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill/full"; // ICU-backed Hebrew calendar: an independent oracle for Hebcal
import { greg2abs } from "@hebcal/hdate";
import { gregorian, hebrew } from "@/core/calendars/registry";
import { RATA_DIE_OF_EPOCH, epochDayToIsoPlainDate, weekdayOf } from "@/core/time/epochDay";

const iso = (s: string) => gregorian.toEpochDay(fromIso(s));
function fromIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, monthCode: `M${String(m).padStart(2, "0")}`, day: d };
}
const icuHebrew = (epochDay: number) => Temporal.PlainDate.from(epochDayToIsoPlainDate(epochDay).toString()).withCalendar("hebrew");

describe("universal time axis", () => {
  it("bridges Hebcal's Rata Die count to ISO epoch days", () => {
    expect(greg2abs(new Date(1970, 0, 1))).toBe(RATA_DIE_OF_EPOCH);
  });
  it("epoch day 0 is Thursday 1970-01-01", () => {
    expect(gregorian.fromEpochDay(0)).toEqual({ calendar: "gregory", year: 1970, monthCode: "M01", day: 1 });
    expect(weekdayOf(0)).toBe(4);
  });
});

describe("Gregorian engine", () => {
  it("agrees with Date.UTC day counts from 1600 to 2400", () => {
    for (let n = Date.UTC(1600, 0, 1) / 864e5; n < Date.UTC(2400, 0, 1) / 864e5; n += 7) {
      const g = gregorian.fromEpochDay(n);
      const d = new Date(n * 864e5);
      expect([g.year, g.monthCode, g.day]).toEqual([d.getUTCFullYear(), `M${String(d.getUTCMonth() + 1).padStart(2, "0")}`, d.getUTCDate()]);
      expect(gregorian.toEpochDay(g)).toBe(n);
    }
  });
  it("knows leap years and February lengths", () => {
    expect(gregorian.isLeapYear(2000)).toBe(true);
    expect(gregorian.isLeapYear(1900)).toBe(false);
    expect(gregorian.daysInMonth(2028, "M02")).toBe(29);
    expect(gregorian.isValid({ year: 2027, monthCode: "M02", day: 29 })).toBe(false);
  });
});

describe("Hebrew engine (Hebcal) cross-checked against ICU", () => {
  it("matches ICU for every day from 1900 to 2100", () => {
    const start = iso("1900-01-01");
    const end = iso("2101-01-01");
    for (let n = start; n < end; n++) {
      const ours = hebrew.fromEpochDay(n);
      const icu = icuHebrew(n);
      if (ours.year !== icu.year || ours.monthCode !== icu.monthCode || ours.day !== icu.day)
        throw new Error(`Mismatch at epoch day ${n}: ${JSON.stringify(ours)} vs ICU ${icu.toString()}`);
      if (hebrew.toEpochDay(ours) !== n) throw new Error(`Round-trip failed at ${n}`);
    }
  });

  it("matches ICU month lengths (variable Cheshvan and Kislev) for 5600–5900", () => {
    for (let y = 5600; y <= 5900; y++) {
      for (const m of hebrew.monthsInYear(y)) {
        const icu = Temporal.PlainYearMonth.from({ calendar: "hebrew", year: y, monthCode: m.monthCode, day: 1 } as never, { overflow: "reject" });
        expect(m.days, `${y} ${m.monthCode}`).toBe(icu.daysInMonth);
      }
    }
  });

  it("places Rosh Hashanah on known Gregorian days", () => {
    expect(hebrew.toEpochDay({ year: 5784, monthCode: "M01", day: 1 })).toBe(iso("2023-09-16"));
    expect(hebrew.toEpochDay({ year: 5785, monthCode: "M01", day: 1 })).toBe(iso("2024-10-03"));
    expect(hebrew.toEpochDay({ year: 5786, monthCode: "M01", day: 1 })).toBe(iso("2025-09-23"));
  });

  it("Cheshvan and Kislev genuinely vary in length", () => {
    const seen = new Set<string>();
    for (let y = 5780; y < 5800; y++) seen.add(`${hebrew.daysInMonth(y, "M02")}/${hebrew.daysInMonth(y, "M03")}`);
    expect(seen).toEqual(new Set(["29/29", "29/30", "30/30"]));
  });
});

describe("Hebrew year structure", () => {
  it("leap years have Adar I and Adar II; common years have a single Adar", () => {
    const leap = hebrew.monthsInYear(5787);
    expect(leap.map((m) => m.monthCode)).toEqual(["M01", "M02", "M03", "M04", "M05", "M05L", "M06", "M07", "M08", "M09", "M10", "M11", "M12"]);
    expect(leap.map((m) => hebrew.monthName({ year: 5787, monthCode: m.monthCode }, "en")).slice(4, 8)).toEqual(["Sh'vat", "Adar I", "Adar II", "Nisan"]);
    const common = hebrew.monthsInYear(5786);
    expect(common).toHaveLength(12);
    expect(hebrew.monthName({ year: 5786, monthCode: "M06" }, "en")).toBe("Adar");
    expect(hebrew.monthName({ year: 5787, monthCode: "M05L" }, "he")).toBe("אדר א׳");
    expect(hebrew.monthName({ year: 5787, monthCode: "M06" }, "he")).toBe("אדר ב׳");
  });

  it("has 7 leap years in every 19-year cycle, matching ICU", () => {
    let count = 0;
    for (let y = 5776; y < 5795; y++) {
      const icu = Temporal.PlainDate.from({ calendar: "hebrew", year: y, monthCode: "M01", day: 1 } as never);
      expect(hebrew.isLeapYear(y)).toBe(icu.inLeapYear);
      if (hebrew.isLeapYear(y)) count++;
    }
    expect(count).toBe(7);
  });

  it("rejects dates that do not exist", () => {
    expect(hebrew.isValid({ year: 5786, monthCode: "M05L", day: 1 })).toBe(false); // no Adar I in a common year
    expect(hebrew.isValid({ year: 5784, monthCode: "M03", day: 30 })).toBe(false); // short Kislev
    expect(hebrew.isValid({ year: 5787, monthCode: "M03", day: 30 })).toBe(true);
    expect(hebrew.isValid({ year: 5787, monthCode: "M06", day: 30 })).toBe(false); // Adar II has 29 days
    expect(hebrew.isValid({ year: 5787, monthCode: "M01", day: 0 })).toBe(false);
    expect(() => hebrew.toEpochDay({ year: 5784, monthCode: "M03", day: 30 })).toThrow(RangeError);
  });

  it("navigates months in Hebrew order, independent of Gregorian months", () => {
    expect(hebrew.addMonths({ year: 5787, monthCode: "M05" }, 1)).toEqual({ year: 5787, monthCode: "M05L" });
    expect(hebrew.addMonths({ year: 5787, monthCode: "M05" }, 2)).toEqual({ year: 5787, monthCode: "M06" });
    expect(hebrew.addMonths({ year: 5786, monthCode: "M05" }, 1)).toEqual({ year: 5786, monthCode: "M06" });
    expect(hebrew.addMonths({ year: 5786, monthCode: "M12" }, 1)).toEqual({ year: 5787, monthCode: "M01" });
    expect(hebrew.addMonths({ year: 5787, monthCode: "M01" }, -1)).toEqual({ year: 5786, monthCode: "M12" });
    expect(hebrew.addMonths({ year: 5787, monthCode: "M01" }, 13)).toEqual({ year: 5788, monthCode: "M01" });
  });

  it("a Hebrew month is a contiguous run of days that crosses Gregorian month boundaries", () => {
    const first = hebrew.toEpochDay({ year: 5787, monthCode: "M03", day: 1 });
    const days = hebrew.daysInMonth(5787, "M03")!;
    const gregMonths = new Set<string>();
    for (let i = 0; i < days; i++) {
      expect(hebrew.fromEpochDay(first + i)).toMatchObject({ year: 5787, monthCode: "M03", day: i + 1 });
      gregMonths.add(gregorian.fromEpochDay(first + i).monthCode);
    }
    expect(gregMonths.size).toBe(2);
    expect(hebrew.fromEpochDay(first + days)).toMatchObject({ monthCode: "M04", day: 1 });
  });

  it("formats dates in both languages", () => {
    const d = { year: 5787, monthCode: "M03", day: 15 };
    expect(hebrew.formatDate(d, "en")).toBe("15 Kislev 5787");
    expect(hebrew.formatDate(d, "he")).toBe("ט״ו כסלו תשפ״ז");
    expect(gregorian.formatDate({ year: 2026, monthCode: "M11", day: 25 }, "en")).toBe("25 November 2026");
  });
});
