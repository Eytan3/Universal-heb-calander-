/**
 * Randomised invariants for the engine (deterministic seed). Catches crashes and
 * inconsistencies across every frequency, calendar, skip policy and range.
 */
import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { getCalendar, gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarId, SkipPolicy } from "@/core/calendars/types";
import { expandEvent } from "@/core/events/expand";
import { createEvent, FREQUENCIES, validateEventInput, type Frequency } from "@/core/events/schema";
import { buildIcs } from "@/core/export/ics";
import { HOLIDAY_CATEGORIES, jewishHolidays } from "@/core/holidays/registry";

let seed = 20261123;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

function randomDate(cal: CalendarId) {
  const c = getCalendar(cal);
  const day0 = gregorian.toEpochDay({ year: 1990, monthCode: "M01", day: 1 });
  return c.fromEpochDay(day0 + int(0, 365 * 50));
}

describe("fuzz: expansion invariants", () => {
  it("holds for 3000 random rules", () => {
    for (let i = 0; i < 3000; i++) {
      const cal = pick(["hebrew", "gregory"] as const);
      // bias towards hard days: 29, 30, 31 and Adar I
      let start = randomDate(cal);
      if (rnd() < 0.3) {
        const c = getCalendar(cal);
        const days = c.daysInMonth(start.year, start.monthCode)!;
        start = { ...start, day: days };
      }
      const frequency = pick(FREQUENCIES) as Frequency;
      const skip = pick(["omit", "backward", "forward"] as SkipPolicy[]);
      const interval = rnd() < 0.7 ? 1 : int(2, 5);
      const v = validateEventInput({ title: "x", start, recurrenceRules: [{ frequency, interval, skip }] });
      expect(v.ok, JSON.stringify(start)).toBe(true);
      if (!v.ok) continue;
      const ev = createEvent(v.value, `e${i}`);
      const rs = gregorian.toEpochDay({ year: 1980, monthCode: "M01", day: 1 }) + int(0, 365 * 70);
      const range = { start: rs, end: rs + int(1, 800) };
      const occ = expandEvent(ev, range);
      const ctx = JSON.stringify({ start, frequency, skip, interval, range });
      const keys = new Set<string>();
      let prev = -Infinity;
      for (const o of occ) {
        expect(o.epochDay >= range.start && o.epochDay < range.end, ctx).toBe(true);
        expect(o.epochDay > prev, `sorted/unique days ${ctx}`).toBe(true);
        prev = o.epochDay;
        expect(keys.has(o.key), `duplicate key ${o.key} ${ctx}`).toBe(false);
        keys.add(o.key);
        expect(o.epochDay >= getCalendar(cal).toEpochDay(start), `before start ${ctx}`).toBe(true);
        expect(getCalendar(cal).toEpochDay(o.native), `native mismatch ${ctx}`).toBe(o.epochDay);
        if ((frequency === "monthly" || frequency === "yearly") && o.adjustment === "none") expect(o.native.day, ctx).toBe(start.day);
        if (frequency === "yearly" && o.adjustment === "none") expect(o.native.monthCode, ctx).toBe(start.monthCode);
      }
      // A rule must never skip more than it should: with forward/backward, every period has an occurrence.
      if (frequency === "monthly" && skip !== "omit" && interval === 1 && range.end - range.start > 70 && range.start > getCalendar(cal).toEpochDay(start) + 40)
        expect(occ.length, `monthly gap ${ctx}`).toBeGreaterThanOrEqual(Math.floor((range.end - range.start) / 31) - 1);
    }
  }, 30_000); // heavy by design: a generous limit so a busy machine does not fail it

  it("ICS of random event sets always parses, with unique UIDs", () => {
    for (let n = 0; n < 40; n++) {
      const events = Array.from({ length: int(1, 6) }, (_, i) => {
        const cal = pick(["hebrew", "gregory"] as const);
        const v = validateEventInput({
          title: pick(["a, b; c", "שלום\nעולם", "x".repeat(120), "🎉 party"]), description: rnd() < 0.5 ? "line1\nline2, ;" : undefined,
          start: randomDate(cal), recurrenceRules: rnd() < 0.2 ? undefined : [{ frequency: pick(FREQUENCIES), skip: "forward", interval: int(1, 3) }],
        });
        if (!v.ok) throw new Error(v.errors.join(", "));
        return createEvent(v.value, `u${n}-${i}`);
      });
      const start = gregorian.toEpochDay({ year: 2026, monthCode: "M01", day: 1 });
      const ics = buildIcs(events, { range: { start, end: start + 3 * 366 } });
      const comp = new ICAL.Component(ICAL.parse(ics));
      const uids = comp.getAllSubcomponents("vevent").map((v) => String(v.getFirstPropertyValue("uid")));
      expect(new Set(uids).size).toBe(uids.length);
      for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("holidays never crash and never duplicate within a day, across far years", () => {
    for (const y of [3800, 4500, 5000, 5500, 5786, 6000, 7000, 9000]) {
      const range = { start: hebrew.toEpochDay({ year: y, monthCode: "M01", day: 1 }), end: hebrew.toEpochDay({ year: y + 1, monthCode: "M01", day: 1 }) };
      for (const region of ["il", "diaspora"] as const) {
        const occ = jewishHolidays.occurrences(range, { region, categories: HOLIDAY_CATEGORIES });
        const seen = new Set(occ.map((o) => `${o.epochDay}|${o.id}`));
        expect(seen.size).toBe(occ.length);
      }
    }
  });
});
