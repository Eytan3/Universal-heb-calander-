import { describe, expect, it } from "vitest";
import { emptyDocument, validateEventInput, type EventInput } from "@/core/events/schema";
import { addEvent, applyOccurrenceAction } from "@/core/events/store";
import { expandEvent } from "@/core/events/expand";
import { buildCollectionsIcs } from "@/core/export/ics";
import { importBackup } from "@/core/events/import";
import { gregorian } from "@/core/calendars/gregorian";
import { endOf, icsUtcDateTime, offsetMinutes, zonedToUtc } from "@/core/time/zoned";

const day = (y: number, m: number, d: number) => gregorian.toEpochDay({ year: y, monthCode: `M${String(m).padStart(2, "0")}`, day: d });
const utc = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h, mi);

describe("wall-clock time in a time zone", () => {
  it("Jerusalem: winter +2, summer +3; 10:00 local is 08:00Z / 07:00Z", () => {
    expect(offsetMinutes(utc(2027, 1, 15, 12), "Asia/Jerusalem")).toBe(120);
    expect(offsetMinutes(utc(2027, 7, 15, 12), "Asia/Jerusalem")).toBe(180);
    expect(zonedToUtc(day(2027, 1, 15), "10:00", "Asia/Jerusalem")).toBe(utc(2027, 1, 15, 8));
    expect(zonedToUtc(day(2027, 7, 15), "10:00", "Asia/Jerusalem")).toBe(utc(2027, 7, 15, 7));
  });

  it("New York across both DST changes, and a time that does not exist moves forward", () => {
    expect(zonedToUtc(day(2027, 3, 13), "09:00", "America/New_York")).toBe(utc(2027, 3, 13, 14)); // EST
    expect(zonedToUtc(day(2027, 3, 15), "09:00", "America/New_York")).toBe(utc(2027, 3, 15, 13)); // EDT
    // 2027-03-14 02:30 does not exist in New York (02:00 → 03:00): becomes 03:30 EDT = 07:30Z
    expect(zonedToUtc(day(2027, 3, 14), "02:30", "America/New_York")).toBe(utc(2027, 3, 14, 7, 30));
    expect(zonedToUtc(day(2027, 11, 8), "09:00", "America/New_York")).toBe(utc(2027, 11, 8, 14)); // back to EST
    // 2027-11-07 01:30 happens twice (02:00 EDT → 01:00 EST): the first one, EDT = 05:30Z
    expect(zonedToUtc(day(2027, 11, 7), "01:30", "America/New_York")).toBe(utc(2027, 11, 7, 5, 30));
    // Jerusalem's own gap: 26 Mar 2027 02:00 → 03:00
    expect(zonedToUtc(day(2027, 3, 26), "02:30", "Asia/Jerusalem")).toBe(utc(2027, 3, 26, 0, 30));
  });

  it("end times, including past midnight", () => {
    expect(endOf("10:00", 90)).toEqual({ hhmm: "11:30", dayOffset: 0 });
    expect(endOf("22:00", 180)).toEqual({ hhmm: "01:00", dayOffset: 1 });
    expect(icsUtcDateTime(utc(2027, 3, 4, 8))).toBe("20270304T080000Z");
  });
});

const timed = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Team meeting", start: { calendar: "gregory", year: 2027, monthCode: "M03", day: 1 },
  showWithoutTime: false, startTime: "10:00", durationMinutes: 45, timeZone: "Asia/Jerusalem", ...over,
});

describe("timed events", () => {
  it("validation: all-day is the default; timed needs a valid time, length and zone", () => {
    const allDay = validateEventInput({ title: "x", start: { calendar: "gregory", year: 2027, monthCode: "M03", day: 1 } });
    expect(allDay.ok && allDay.value.showWithoutTime).toBeUndefined();
    expect(validateEventInput(timed()).ok).toBe(true);
    expect(validateEventInput(timed({ startTime: "24:00" })).ok).toBe(false);
    expect(validateEventInput(timed({ startTime: "9:00" })).ok).toBe(false);
    expect(validateEventInput(timed({ durationMinutes: -5 })).ok).toBe(false);
    expect(validateEventInput(timed({ timeZone: "Mars/Olympus" })).ok).toBe(false);
    // An all-day event never carries stray time fields
    const v = validateEventInput({ ...timed(), showWithoutTime: true });
    expect(v.ok && "startTime" in v.value).toBe(false);
  });

  it("ICS: a weekly 10:00 Jerusalem meeting stays at 10:00 local across the DST change (exact UTC per occurrence)", () => {
    const doc = emptyDocument();
    addEvent(doc, timed({ recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "weekly", rscale: "gregory" }] }), "m");
    const ics = buildCollectionsIcs(doc, ["personal"], { range: { start: day(2027, 3, 15), end: day(2027, 4, 6) }, calendarName: "x", locale: "en" })
      .replace(/\r\n /g, "");
    const starts = ics.split("\r\n").filter((l) => l.startsWith("DTSTART"));
    // Israel moves to summer time on Friday 26 March 2027
    expect(starts).toEqual(["DTSTART:20270315T080000Z", "DTSTART:20270322T080000Z", "DTSTART:20270329T070000Z", "DTSTART:20270405T070000Z"]);
    expect(ics).toContain("DTEND:20270315T084500Z");
    expect(ics).not.toContain("RRULE"); // timed series are materialised, no VTIMEZONE needed
    expect(ics).toContain("TRANSP:OPAQUE");
  });

  it("ICS: all-day events keep DATE values; a Hebrew-yearly timed event lands on the right days", () => {
    const doc = emptyDocument();
    addEvent(doc, { title: "Birthday", start: { calendar: "gregory", year: 2027, monthCode: "M05", day: 2 } }, "b");
    addEvent(doc, timed({ title: "Seder", startTime: "19:30", durationMinutes: 240, start: { calendar: "hebrew", year: 5787, monthCode: "M07", day: 15 },
      recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "hebrew" }] }), "s");
    const ics = buildCollectionsIcs(doc, ["personal"], { range: { start: day(2027, 1, 1), end: day(2029, 1, 1) }, calendarName: "x", locale: "en" }).replace(/\r\n /g, "");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270502");
    expect(ics).toContain("DTSTART:20270422T163000Z"); // 15 Nisan 5787 = 22 Apr 2027, 19:30 IDT
    expect(ics).toContain("DTSTART:20280411T163000Z"); // 15 Nisan 5788 = 11 Apr 2028
    expect(ics).toContain("DTEND:20270422T203000Z");
  });

  it("this event only: a different time for one occurrence; switching all-day applies to the series only", () => {
    const doc = emptyDocument();
    const ev = addEvent(doc, timed({ recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "weekly", rscale: "gregory" }] }), "w");
    const second = day(2027, 3, 8);
    applyOccurrenceAction(doc, "w", "edit-this", second, timed({ start: { calendar: "gregory", year: 2027, monthCode: "M03", day: 8 }, startTime: "12:00" }), "n");
    const occ = expandEvent(doc.events[0], { start: day(2027, 3, 1), end: day(2027, 3, 16) });
    expect(occ.map((o) => o.startTime ?? ev.startTime)).toEqual(["10:00", "12:00", "10:00"]);
    expect(() => applyOccurrenceAction(doc, "w", "edit-this", day(2027, 3, 15), { title: "x", start: { calendar: "gregory", year: 2027, monthCode: "M03", day: 15 } }, "n2"))
      .toThrow(/all-day/);
    const ics = buildCollectionsIcs(doc, ["personal"], { range: { start: day(2027, 3, 1), end: day(2027, 3, 16) }, calendarName: "x", locale: "en" });
    expect(ics).toContain("DTSTART:20270308T100000Z"); // 12:00 in winter Jerusalem
  });

  it("backup round-trip keeps times, length and zone", () => {
    const src = emptyDocument();
    addEvent(src, timed({ timeZone: "America/New_York", startTime: "18:15", durationMinutes: 0 }), "t");
    const file = JSON.parse(JSON.stringify({ schemaVersion: 3, collections: src.collections, events: src.events }));
    const doc = emptyDocument();
    importBackup(doc, file, () => "new");
    expect(doc.events[0]).toMatchObject({ showWithoutTime: false, startTime: "18:15", durationMinutes: 0, timeZone: "America/New_York" });
  });
});
