import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill/full";
import { gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate, SkipPolicy } from "@/core/calendars/types";
import { describeRule } from "@/core/events/describe";
import { expandEvent, ruleMayHitMissingDate } from "@/core/events/expand";
import { createEvent, validateEventInput, type Frequency, type UCEvent } from "@/core/events/schema";
import { buildIcs } from "@/core/export/ics";
import { epochDayToIsoPlainDate, weekdayOf } from "@/core/time/epochDay";

const H = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "hebrew", year, monthCode, day });
const G = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "gregory", year, monthCode, day });
const ALL = { start: -100000, end: 100000 };

function ev(start: CalendarDate, frequency: Frequency, interval = 1, skip?: SkipPolicy): UCEvent {
  const v = validateEventInput({ title: "t", start, recurrenceRules: [{ frequency, interval, skip }] });
  if (!v.ok) throw new Error(v.errors.join(", "));
  return createEvent(v.value, "e1", new Date("2026-11-23T00:00:00Z"));
}
const icu = (day: number) => Temporal.PlainDate.from(epochDayToIsoPlainDate(day).toString()).withCalendar("hebrew");

describe("daily and weekly", () => {
  it("daily every N days, the same regardless of the event's calendar", () => {
    const a = expandEvent(ev(H(5787, "M03", 13), "daily", 3), ALL).slice(0, 10).map((o) => o.epochDay);
    const b = expandEvent(ev(G(2026, "M11", 23), "daily", 3), ALL).slice(0, 10).map((o) => o.epochDay);
    expect(a).toEqual(b);
    a.forEach((d, i) => expect(d - a[0]).toBe(3 * i));
  });

  it("weekly keeps the weekday and honours the interval", () => {
    const occ = expandEvent(ev(G(2026, "M11", 23), "weekly", 2), ALL).slice(0, 8);
    occ.forEach((o, i) => {
      expect(weekdayOf(o.epochDay)).toBe(1); // Monday
      expect(o.epochDay - occ[0].epochDay).toBe(14 * i);
    });
  });

  it("windows correctly far from the start", () => {
    const e = ev(G(2026, "M11", 23), "daily");
    const start = gregorian.toEpochDay(G(2030, "M01", 1));
    const occ = expandEvent(e, { start, end: start + 7 });
    expect(occ.map((o) => o.epochDay)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => start + i));
  });
});

describe("monthly in the event's own calendar", () => {
  it("Hebrew monthly on the 15th follows Hebrew months, incl. Adar I and Adar II (ICU-checked)", () => {
    const occ = expandEvent(ev(H(5787, "M03", 15), "monthly"), ALL).slice(0, 13);
    expect(occ.map((o) => o.native.monthCode)).toEqual(["M03", "M04", "M05", "M05L", "M06", "M07", "M08", "M09", "M10", "M11", "M12", "M01", "M02"]);
    for (const o of occ) {
      const i = icu(o.epochDay);
      expect([i.monthCode, i.day]).toEqual([o.native.monthCode, 15]);
    }
  });

  it("Hebrew 30th in 29-day months: omit / backward / forward", () => {
    const months = (skip: SkipPolicy) => expandEvent(ev(H(5787, "M02", 30), "monthly", 1, skip), ALL).slice(0, 6);
    const omit = months("omit");
    omit.forEach((o) => expect(o.native.day).toBe(30));
    expect(omit.every((o) => hebrew.daysInMonth(o.native.year, o.native.monthCode) === 30)).toBe(true);
    // Tevet always has 29 days → it is skipped with OMIT
    expect(omit.map((o) => o.native.monthCode)).not.toContain("M04");
    const back = months("backward");
    expect(back.find((o) => o.key === "hebrew-5787-M04")!.native).toEqual(H(5787, "M04", 29));
    const fwd = months("forward");
    expect(fwd.find((o) => o.key === "hebrew-5787-M04")!.native).toEqual(H(5787, "M05", 1));
  });

  it("Gregorian 31st: omit skips short months, backward uses the last day", () => {
    const omit = expandEvent(ev(G(2027, "M01", 31), "monthly", 1, "omit"), ALL).slice(0, 7).map((o) => o.native.monthCode);
    expect(omit).toEqual(["M01", "M03", "M05", "M07", "M08", "M10", "M12"]);
    const back = expandEvent(ev(G(2027, "M01", 31), "monthly", 1, "backward"), ALL).slice(0, 3).map((o) => o.native);
    expect(back).toEqual([G(2027, "M01", 31), G(2027, "M02", 28), G(2027, "M03", 31)]);
  });

  it("every N months", () => {
    const occ = expandEvent(ev(G(2026, "M11", 23), "monthly", 3), ALL).slice(0, 4).map((o) => o.native.monthCode);
    expect(occ).toEqual(["M11", "M02", "M05", "M08"]);
  });

  it("knows when to ask for a missing-date policy", () => {
    expect(ruleMayHitMissingDate(hebrew, H(5787, "M03", 30), "monthly")).toBe(true);
    expect(ruleMayHitMissingDate(hebrew, H(5787, "M03", 29), "monthly")).toBe(false);
    expect(ruleMayHitMissingDate(gregorian, G(2027, "M01", 29), "monthly")).toBe(true); // February
    expect(ruleMayHitMissingDate(gregorian, G(2027, "M01", 28), "monthly")).toBe(false);
    expect(ruleMayHitMissingDate(gregorian, G(2027, "M01", 31), "weekly")).toBe(false);
  });
});

describe("descriptions and ICS", () => {
  it("describes each frequency in both languages", () => {
    expect(describeRule(ev(G(2026, "M11", 23), "weekly", 2), "en")).toBe("Every 2 weeks on Monday");
    expect(describeRule(ev(H(5787, "M03", 15), "monthly"), "en")).toBe("Every month on day 15 (Hebrew months)");
    expect(describeRule(ev(H(5787, "M03", 15), "monthly"), "he")).toBe("כל חודש ב־ט״ו לחודש (לוח עברי)");
    expect(describeRule(ev(G(2026, "M11", 23), "daily"), "he")).toBe("כל יום");
  });

  it("exports daily/weekly as RRULE and materialises Hebrew monthly", () => {
    const range = { start: gregorian.toEpochDay(G(2026, "M11", 1)), end: gregorian.toEpochDay(G(2027, "M11", 1)) };
    const weekly = { ...ev(G(2026, "M11", 23), "weekly"), uid: "w" };
    const monthly = { ...ev(H(5787, "M03", 15), "monthly"), uid: "m" };
    const comp = new ICAL.Component(ICAL.parse(buildIcs([weekly, monthly], { range })));
    const vevents = comp.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    const w = vevents.filter((e) => e.uid.startsWith("w."));
    expect(w).toHaveLength(1);
    expect(w[0].isRecurring()).toBe(true);
    const rrule = w[0].component.getFirstPropertyValue("rrule") as unknown as { freq: string; interval: number };
    expect([rrule.freq, rrule.interval]).toEqual(["WEEKLY", 1]);
    const m = vevents.filter((e) => e.uid.startsWith("m."));
    expect(m.length).toBe(12); // Kislev 5787 … Cheshvan 5788 within the window (leap year: 13 months/yr)
    expect(new Set(m.map((e) => e.uid)).size).toBe(m.length);
  });
});

describe("performance regressions", () => {
  it("a Hebrew monthly rule that began ~2000 years ago expands a month quickly", () => {
    const e = ev(H(3762, "M01", 30), "monthly", 1, "forward");
    const t0 = gregorian.toEpochDay(G(2026, "M11", 23));
    const s = performance.now();
    for (let i = 0; i < 20; i++) expect(expandEvent(e, { start: t0 + i * 30, end: t0 + i * 30 + 32 }).length).toBeGreaterThan(0);
    expect((performance.now() - s) / 20).toBeLessThan(25); // was ≈1100 ms per render before the fix
  });
});

describe("repeats that start from today for an old event (rule.from)", () => {
  const today = gregorian.toEpochDay(G(2026, "M11", 23));
  const fromToday = (start: CalendarDate, frequency: Frequency) => {
    const v = validateEventInput({ title: "old", start, recurrenceRules: [{ frequency, skip: "forward", from: getCal(start).fromEpochDay(today) }] });
    if (!v.ok) throw new Error(v.errors.join(", "));
    return createEvent(v.value, "old");
  };
  const getCal = (d: CalendarDate) => (d.calendar === "hebrew" ? hebrew : gregorian);

  it("an old Hebrew birthday keeps its original day but no repeats in the past", () => {
    const e = fromToday(H(5750, "M03", 15), "yearly");
    const occ = expandEvent(e, { start: hebrew.toEpochDay(H(5750, "M01", 1)), end: today + 800 });
    expect(occ[0].native).toEqual(H(5750, "M03", 15)); // the original event itself
    expect(occ.slice(1).every((o) => o.epochDay >= today)).toBe(true);
    expect(occ.slice(1).map((o) => o.native.year)).toEqual([5787, 5788, 5789]);
  });

  it("weekly from today: original kept, series continues from today on the same weekday", () => {
    const e = fromToday(G(2020, "M01", 6), "weekly"); // a Monday
    const occ = expandEvent(e, { start: gregorian.toEpochDay(G(2019, "M01", 1)), end: today + 15 });
    expect(occ.map((o) => o.epochDay)).toEqual([gregorian.toEpochDay(G(2020, "M01", 6)), today, today + 7, today + 14]);
  });

  it("validation drops a 'from' that is not after the start", () => {
    const v = validateEventInput({ title: "x", start: G(2026, "M11", 23), recurrenceRules: [{ frequency: "daily", from: G(2026, "M11", 1) }] });
    expect(v.ok && v.value.recurrenceRules![0].from).toBeUndefined();
    const bad = validateEventInput({ title: "x", start: G(2026, "M11", 23), recurrenceRules: [{ frequency: "daily", from: H(5787, "M03", 20) }] });
    expect(bad.ok).toBe(false);
  });

  it("ICS: weekly-from-today exports the original plus an RRULE starting today", () => {
    const e = fromToday(G(2020, "M01", 6), "weekly");
    const comp = new ICAL.Component(ICAL.parse(buildIcs([e], { range: { start: today - 400, end: today + 400 } })));
    const evs = comp.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    expect(evs.map((x) => [x.uid.split("@")[0], x.startDate.toString()])).toEqual([["old.origin", "2020-01-06"], ["old.rule", "2026-11-23"]]);
  });

  it("describes the start of repeats", () => {
    expect(describeRule(fromToday(H(5750, "M03", 15), "yearly"), "he")).toContain("החל מ־");
  });
});

describe("End Repeat (rule.until)", () => {
  const withUntil = (start: CalendarDate, frequency: Frequency, until: CalendarDate) => {
    const v = validateEventInput({ title: "u", start, recurrenceRules: [{ frequency, until }] });
    if (!v.ok) throw new Error(v.errors.join(", "));
    return createEvent(v.value, "u");
  };
  it("stops on the end date (inclusive), in the event's calendar", () => {
    const occ = expandEvent(withUntil(H(5787, "M03", 15), "yearly", H(5790, "M03", 15)), ALL);
    expect(occ.map((o) => o.native.year)).toEqual([5787, 5788, 5789, 5790]);
    const w = expandEvent(withUntil(G(2026, "M11", 23), "weekly", G(2026, "M12", 13)), ALL);
    expect(w).toHaveLength(3); // 23 Nov, 30 Nov, 7 Dec
  });
  it("rejects an end before the start", () => {
    expect(validateEventInput({ title: "u", start: G(2026, "M11", 23), recurrenceRules: [{ frequency: "daily", until: G(2026, "M11", 1) }] }).ok).toBe(false);
  });
  it("ICS: weekly with UNTIL as a DATE", () => {
    const comp = new ICAL.Component(ICAL.parse(buildIcs([withUntil(G(2026, "M11", 23), "weekly", G(2026, "M12", 13))], { range: { start: 20000, end: 21000 } })));
    const rr = comp.getFirstSubcomponent("vevent")!.getFirstPropertyValue("rrule") as unknown as { until: { toString(): string } };
    expect(rr.until.toString()).toBe("2026-12-13");
  });
  it("describes the end", () => {
    expect(describeRule(withUntil(H(5787, "M03", 15), "yearly", H(5790, "M03", 15)), "he")).toContain("עד ");
  });
});
