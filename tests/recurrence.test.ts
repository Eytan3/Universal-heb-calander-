import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill/full";
import { HDate, birthdayOrAnniversary } from "@hebcal/hdate";
import { gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate, SkipPolicy } from "@/core/calendars/types";
import { expandEvent, mayBeMissing, resolveYearlyDate } from "@/core/events/expand";
import { createEvent, updateEvent, validateEventInput, type EventInput, type UCEvent } from "@/core/events/schema";
import { RATA_DIE_OF_EPOCH, epochDayToIsoPlainDate } from "@/core/time/epochDay";

const ALL: { start: number; end: number } = { start: -200000, end: 200000 };

function ev(start: CalendarDate, skip?: SkipPolicy, interval?: number): UCEvent {
  const input: EventInput = {
    title: "Test",
    start,
    recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: start.calendar, skip, interval }],
  };
  const v = validateEventInput(input);
  if (!v.ok) throw new Error(v.errors.join(", "));
  return createEvent(v.value, "evt-1", new Date("2026-11-23T00:00:00Z"));
}
const H = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "hebrew", year, monthCode, day });
const G = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "gregory", year, monthCode, day });
const occByYear = (e: UCEvent) => new Map(expandEvent(e, ALL).map((o) => [Number(o.key.split("-")[1]), o]));

describe("Hebrew yearly recurrence", () => {
  it("15 Kislev stays 15 Kislev every year and lands on the ICU-confirmed absolute day", () => {
    const occ = expandEvent(ev(H(5787, "M03", 15)), ALL).slice(0, 50);
    expect(occ).toHaveLength(50);
    occ.forEach((o, i) => {
      expect(o.native).toEqual(H(5787 + i, "M03", 15));
      const icu = Temporal.PlainDate.from(epochDayToIsoPlainDate(o.epochDay).toString()).withCalendar("hebrew");
      expect([icu.year, icu.monthCode, icu.day]).toEqual([5787 + i, "M03", 15]);
    });
    expect(gregorian.fromEpochDay(occ[0].epochDay)).toEqual(G(2026, "M11", 25));
  });

  it("never produces occurrences before the event's own start", () => {
    const occ = expandEvent(ev(H(5787, "M03", 15)), ALL);
    expect(occ[0].native.year).toBe(5787);
  });

  it("30 Cheshvan honours the skip policy in years with a 29-day Cheshvan", () => {
    const short = [...Array(30).keys()].map((i) => 5788 + i).filter((y) => hebrew.daysInMonth(y, "M02") === 29);
    expect(short.length).toBeGreaterThan(0);
    const omit = occByYear(ev(H(5787, "M02", 30), "omit"));
    const back = occByYear(ev(H(5787, "M02", 30), "backward"));
    const fwd = occByYear(ev(H(5787, "M02", 30), "forward"));
    for (const y of short) {
      expect(omit.has(y)).toBe(false);
      expect(back.get(y)!.native).toEqual(H(y, "M02", 29));
      expect(fwd.get(y)!.native).toEqual(H(y, "M03", 1));
      expect(fwd.get(y)!.adjustment).toBe("day-forward");
    }
  });

  it("Adar I (leap month) in common years: forward → Adar, backward → Shevat, omit → skipped (RFC 7529 §4.3.3)", () => {
    expect(resolveYearlyDate(hebrew, 5788, "M05L", 8, "forward")!.date).toEqual(H(5788, "M06", 8));
    expect(resolveYearlyDate(hebrew, 5788, "M05L", 8, "backward")!.date).toEqual(H(5788, "M05", 8));
    expect(resolveYearlyDate(hebrew, 5788, "M05L", 8, "omit")).toBeNull();
    expect(resolveYearlyDate(hebrew, 5790, "M05L", 8, "omit")!.date).toEqual(H(5790, "M05L", 8)); // 5790 is leap
    // 30 Adar I → common-year Adar has 29 days → cascades to 1 Nisan when moving forward
    expect(resolveYearlyDate(hebrew, 5788, "M05L", 30, "forward")!.date).toEqual(H(5788, "M07", 1));
  });

  it("Adar of a common year is observed in Adar II of leap years", () => {
    const occ = occByYear(ev(H(5786, "M06", 14)));
    expect(occ.get(5787)!.native).toEqual(H(5787, "M06", 14));
    expect(hebrew.monthName({ year: 5787, monthCode: "M06" }, "en")).toBe("Adar II");
  });

  it("SKIP=FORWARD matches Hebcal's Hebrew birthday rules for every birth date in 5780–5790", () => {
    let checked = 0;
    for (let day = hebrew.toEpochDay({ year: 5780, monthCode: "M01", day: 1 }); day < hebrew.toEpochDay({ year: 5791, monthCode: "M01", day: 1 }); day++) {
      const birth = hebrew.fromEpochDay(day);
      for (let y = birth.year + 1; y <= birth.year + 20; y++) {
        const ours = resolveYearlyDate(hebrew, y, birth.monthCode, birth.day, "forward")!;
        const theirs = birthdayOrAnniversary(y, new HDate(day + RATA_DIE_OF_EPOCH))!;
        expect(hebrew.toEpochDay(ours.date), `${JSON.stringify(birth)} in ${y}`).toBe(theirs.abs() - RATA_DIE_OF_EPOCH);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(70000);
  });

  it("supports intervals in the event's own calendar", () => {
    const occ = expandEvent(ev(H(5787, "M07", 1), "omit", 3), ALL).slice(0, 3);
    expect(occ.map((o) => o.native.year)).toEqual([5787, 5790, 5793]);
  });

  it("flags dates that may be missing so the editor can ask for a policy", () => {
    expect(mayBeMissing(hebrew, 5787, "M03", 30)).toBe(true);
    expect(mayBeMissing(hebrew, 5787, "M05L", 1)).toBe(true);
    expect(mayBeMissing(hebrew, 5787, "M03", 15)).toBe(false);
    expect(mayBeMissing(gregorian, 2028, "M02", 29)).toBe(true);
    expect(mayBeMissing(gregorian, 2028, "M02", 28)).toBe(false);
  });
});

describe("Gregorian yearly recurrence (symmetric)", () => {
  it("25 December stays 25 December while its Hebrew date varies", () => {
    const occ = expandEvent(ev(G(2026, "M12", 25)), ALL).slice(0, 20);
    occ.forEach((o, i) => expect(o.native).toEqual(G(2026 + i, "M12", 25)));
    const hebrewDates = new Set(occ.map((o) => JSON.stringify(hebrew.fromEpochDay(o.epochDay))));
    expect(hebrewDates.size).toBe(20);
  });

  it("29 February honours the skip policy", () => {
    const omit = occByYear(ev(G(2028, "M02", 29), "omit"));
    const back = occByYear(ev(G(2028, "M02", 29), "backward"));
    const fwd = occByYear(ev(G(2028, "M02", 29), "forward"));
    expect([...omit.keys()].slice(0, 3)).toEqual([2028, 2032, 2036]);
    expect(back.get(2029)!.native).toEqual(G(2029, "M02", 28));
    expect(fwd.get(2029)!.native).toEqual(G(2029, "M03", 1));
  });
});

describe("event lifecycle", () => {
  it("one-time events expand to a single occurrence", () => {
    const e = createEvent({ title: "Once", start: H(5787, "M03", 15) }, "x");
    expect(expandEvent(e, ALL)).toHaveLength(1);
    expect(expandEvent(e, { start: 0, end: 10 })).toHaveLength(0);
  });

  it("editing an event regenerates its occurrences and bumps the sequence", () => {
    const e = ev(H(5787, "M03", 15));
    const before = expandEvent(e, ALL).slice(0, 5);
    const v = validateEventInput({ title: "Moved", start: H(5787, "M03", 20), recurrenceRules: [{ frequency: "yearly" }] });
    expect(v.ok).toBe(true);
    const edited = updateEvent(e, (v as { value: EventInput }).value, new Date("2026-12-01T00:00:00Z"));
    const after = expandEvent(edited, ALL).slice(0, 5);
    expect(edited.sequence).toBe(1);
    expect(edited.created).toBe(e.created);
    expect(after.map((o) => o.key)).toEqual(before.map((o) => o.key)); // same occurrence identities…
    after.forEach((o, i) => expect(o.epochDay - before[i].epochDay).toBe(5)); // …moved, not duplicated
  });

  it("stored definitions contain no generated dates", () => {
    const json = JSON.stringify(ev(H(5787, "M03", 15)));
    expect(json).not.toMatch(/epochDay|occurrence|2026-11-25|20261125/);
    expect(JSON.parse(json).start).toEqual(H(5787, "M03", 15));
  });

  it("validation rejects impossible or inconsistent input", () => {
    expect(validateEventInput({ title: "", start: H(5787, "M03", 15) }).ok).toBe(false);
    expect(validateEventInput({ title: "x", start: H(5786, "M05L", 1) }).ok).toBe(false);
    expect(validateEventInput({ title: "x", start: { calendar: "julian", year: 1, monthCode: "M01", day: 1 } }).ok).toBe(false);
    expect(validateEventInput({ title: "x", start: H(5787, "M03", 15), recurrenceRules: [{ frequency: "yearly", rscale: "gregory" }] }).ok).toBe(false);
    expect(validateEventInput({ title: "x", start: H(5787, "M03", 15), recurrenceRules: [{ frequency: "hourly" }] }).ok).toBe(false);
  });
});
