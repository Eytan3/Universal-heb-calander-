import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill/full";
import { gregorian } from "@/core/calendars/registry";
import { createEvent, updateEvent, type EventInput } from "@/core/events/schema";
import { buildIcs, foldLine, icsDate } from "@/core/export/ics";

const range = {
  start: gregorian.toEpochDay({ year: 2026, monthCode: "M01", day: 1 }),
  end: gregorian.toEpochDay({ year: 2030, monthCode: "M01", day: 1 }),
};
const kislev: EventInput = {
  title: "Hebrew birthday, Noa; family dinner",
  description: "Bring the cake.\nCall Grandma",
  start: { calendar: "hebrew", year: 5787, monthCode: "M03", day: 15 },
  recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "hebrew", skip: "forward" }],
};
const greg: EventInput = {
  title: "Anniversary",
  start: { calendar: "gregory", year: 2026, monthCode: "M06", day: 1 },
  recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "gregory" }],
};
const e1 = createEvent(kislev, "a1", new Date("2026-11-23T10:00:00Z"));
const e2 = createEvent(greg, "b2", new Date("2026-11-23T10:00:00Z"));

function vevents(ics: string) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  return comp.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
}

describe("ICS export", () => {
  const ics = buildIcs([e1, e2], { range });

  it("parses as iCalendar with one all-day VEVENT per occurrence", () => {
    const evs = vevents(ics);
    const kislevOcc = evs.filter((e) => e.summary.startsWith("Hebrew birthday"));
    // Expected days computed independently by ICU's Hebrew calendar: 15 Kislev of 5787–5790.
    const expected = [5787, 5788, 5789, 5790].map((y) =>
      Temporal.PlainDate.from({ calendar: "hebrew", year: y, monthCode: "M03", day: 15 } as never).withCalendar("iso8601").toString());
    expect(expected[0]).toBe("2026-11-25");
    expect(kislevOcc.map((e) => e.startDate.toString())).toEqual(expected);
    for (const e of evs) {
      expect(e.startDate.isDate).toBe(true);
      expect(e.endDate.isDate).toBe(true);
      expect(e.endDate.toJSDate().getTime() - e.startDate.toJSDate().getTime()).toBe(864e5);
    }
    expect(evs.filter((e) => e.summary === "Anniversary")).toHaveLength(4); // June 2026–2029
  });

  it("round-trips escaped text and Hebrew through folding", () => {
    const e = vevents(ics).find((x) => x.summary.startsWith("Hebrew birthday"))!;
    expect(e.summary).toBe("Hebrew birthday, Noa; family dinner");
    expect(e.description).toContain("Hebrew date: 15 Kislev 5787");
    expect(e.description).toContain("תאריך עברי: ט״ו כסלו תשפ״ז");
    expect(e.description).toContain("Bring the cake.\nCall Grandma");
  });

  it("uses CRLF line endings and folds lines at 75 octets", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const long = "DESCRIPTION:" + "א".repeat(100);
    expect(foldLine(long).split("\r\n ").join("")).toBe(long);
  });

  it("has unique UIDs that are stable across refreshes and edits", () => {
    const uids = vevents(ics).map((e) => e.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(vevents(buildIcs([e1, e2], { range })).map((e) => e.uid)).toEqual(uids);
    expect(uids).toContain("a1.hebrew-5787@universal-calendar");

    const moved = updateEvent(e1, { ...kislev, start: { ...kislev.start, day: 20 } }, new Date("2026-12-01T00:00:00Z"));
    const after = vevents(buildIcs([moved, e2], { range }));
    expect(after.map((e) => e.uid).sort()).toEqual([...uids].sort());
    const occ = after.find((e) => e.uid === "a1.hebrew-5787@universal-calendar")!;
    expect(occ.startDate.toString()).toBe("2026-11-30");
    expect(occ.sequence).toBe(1);
  });

  it("encodes DATE values via the Gregorian adapter", () => {
    expect(icsDate(0)).toBe("19700101");
  });
});
