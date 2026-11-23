/** Recurring events: change or delete one occurrence, or it and all that follow (Apple Calendar's model). */
import { describe, expect, it } from "vitest";
import { gregorian, hebrew } from "@/core/calendars/registry";
import type { CalendarDate } from "@/core/calendars/types";
import { expandEvent } from "@/core/events/expand";
import { emptyDocument, validateEventInput, type EventInput, type EventStoreDocument } from "@/core/events/schema";
import { addEvent, applyOccurrenceAction, replaceEvent } from "@/core/events/store";

const H = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "hebrew", year, monthCode, day });
const G = (year: number, monthCode: string, day: number): CalendarDate => ({ calendar: "gregory", year, monthCode, day });
const ALL = { start: -100000, end: 100000 };
const input = (raw: unknown): EventInput => { const v = validateEventInput(raw); if (!v.ok) throw new Error(v.errors.join(", ")); return v.value; };
const hd = (d: CalendarDate) => hebrew.toEpochDay(d);

function setup(): { doc: EventStoreDocument; uid: string } {
  const doc = emptyDocument();
  addEvent(doc, input({ title: "Birthday", start: H(5787, "M03", 15), recurrenceRules: [{ frequency: "yearly" }] }), "b");
  return { doc, uid: "b" };
}
const occ = (doc: EventStoreDocument) => doc.events.flatMap((e) => expandEvent(e, ALL).slice(0, 12).map((o) => ({ ...o, title: o.title ?? e.title })))
  .sort((a, b) => a.epochDay - b.epochDay);

describe("this occurrence only", () => {
  it("renames one occurrence; the rest of the series is unchanged", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "edit-this", hd(H(5789, "M03", 15)), input({ title: "Big party", start: H(5789, "M03", 15) }), "n");
    const titles = occ(doc).slice(0, 5).map((o) => `${o.native.year}:${o.title}`);
    expect(titles).toEqual(["5787:Birthday", "5788:Birthday", "5789:Big party", "5790:Birthday", "5791:Birthday"]);
    expect(doc.events).toHaveLength(1);
  });

  it("moves one occurrence to another day (and it is found by its new day)", () => {
    const { doc, uid } = setup();
    const rid = hd(H(5789, "M03", 15));
    applyOccurrenceAction(doc, uid, "edit-this", rid, input({ title: "Birthday", start: H(5789, "M03", 18) }), "n");
    expect(expandEvent(doc.events[0], { start: rid, end: rid + 1 })).toEqual([]);
    const moved = expandEvent(doc.events[0], { start: rid + 3, end: rid + 4 });
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ native: H(5789, "M03", 18), recurrenceId: rid, overridden: true });
  });

  it("deletes one occurrence only", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "delete-this", hd(H(5790, "M03", 15)), undefined, "n");
    expect(occ(doc).slice(0, 4).map((o) => o.native.year)).toEqual([5787, 5788, 5789, 5791]);
  });

  it("editing back to the series values removes the override", () => {
    const { doc, uid } = setup();
    const rid = hd(H(5789, "M03", 15));
    applyOccurrenceAction(doc, uid, "edit-this", rid, input({ title: "X", start: H(5789, "M03", 15) }), "n");
    applyOccurrenceAction(doc, uid, "edit-this", rid, input({ title: "Birthday", start: H(5789, "M03", 15) }), "n");
    expect(doc.events[0].recurrenceOverrides).toBeUndefined();
  });
});

describe("this and all future occurrences", () => {
  it("splits the series: past stays as it was, the future follows the new values", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "edit-this", hd(H(5788, "M03", 15)), input({ title: "Early change", start: H(5788, "M03", 15) }), "n");
    const res = applyOccurrenceAction(doc, uid, "edit-future", hd(H(5790, "M03", 15)),
      input({ title: "Birthday (moved)", start: H(5790, "M03", 20), recurrenceRules: [{ frequency: "yearly" }] }), "b2");
    expect(doc.events).toHaveLength(2);
    expect(res.event!.recurrenceRules![0].until).toEqual(H(5790, "M03", 14));
    const list = occ(doc).slice(0, 6).map((o) => `${o.native.year}-${o.native.day}:${o.title}`);
    expect(list).toEqual(["5787-15:Birthday", "5788-15:Early change", "5789-15:Birthday", "5790-20:Birthday (moved)", "5791-20:Birthday (moved)", "5792-20:Birthday (moved)"]);
  });

  it("deletes this and all future occurrences", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "delete-future", hd(H(5790, "M03", 15)), undefined, "n");
    expect(expandEvent(doc.events[0], ALL).map((o) => o.native.year)).toEqual([5787, 5788, 5789]);
  });

  it("on the first occurrence, 'future' means the whole series", () => {
    const a = setup();
    applyOccurrenceAction(a.doc, a.uid, "edit-future", hd(H(5787, "M03", 15)),
      input({ title: "Renamed", start: H(5787, "M03", 15), recurrenceRules: [{ frequency: "yearly" }] }), "x");
    expect(a.doc.events).toHaveLength(1);
    expect(a.doc.events[0].title).toBe("Renamed");
    const b = setup();
    expect(applyOccurrenceAction(b.doc, b.uid, "delete-future", hd(H(5787, "M03", 15)), undefined, "x").deleted).toBe(true);
    expect(b.doc.events).toHaveLength(0);
  });

  it("works for weekly Gregorian series too", () => {
    const doc = emptyDocument();
    addEvent(doc, input({ title: "Class", start: G(2026, "M11", 23), recurrenceRules: [{ frequency: "weekly" }] }), "w");
    const third = gregorian.toEpochDay(G(2026, "M12", 7));
    applyOccurrenceAction(doc, "w", "edit-future", third, input({ title: "Class (Tue)", start: G(2026, "M12", 8), recurrenceRules: [{ frequency: "weekly" }] }), "w2");
    const iso = doc.events.flatMap((e) => expandEvent(e, { start: third - 14, end: third + 15 }).map((o) => { const g = gregorian.fromEpochDay(o.epochDay); return `${g.monthCode}-${g.day}`; })).sort();
    // old series: 23 Nov, 30 Nov (ends 6 Dec) · new series on Tuesdays from 8 Dec: 8, 15 Dec (window ends 21 Dec)
    expect(iso).toEqual(["M11-23", "M11-30", "M12-15", "M12-8"].sort());
  });
});

describe("safety", () => {
  it("rejects a day that is not an occurrence, and non-recurring events", () => {
    const { doc, uid } = setup();
    expect(() => applyOccurrenceAction(doc, uid, "delete-this", hd(H(5789, "M03", 16)), undefined, "n")).toThrow(/occurrence/);
    addEvent(doc, input({ title: "Once", start: G(2026, "M11", 23) }), "o");
    expect(() => applyOccurrenceAction(doc, "o", "delete-this", gregorian.toEpochDay(G(2026, "M11", 23)), undefined, "n")).toThrow(/repeat/);
  });
  it("occurrence changes survive editing the whole series", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "delete-this", hd(H(5790, "M03", 15)), undefined, "n");
    replaceEvent(doc, uid, input({ title: "Renamed", start: H(5787, "M03", 15), recurrenceRules: [{ frequency: "yearly" }] }));
    expect(expandEvent(doc.events[0], ALL).slice(0, 4).map((o) => o.native.year)).toEqual([5787, 5788, 5789, 5791]);
  });
});

describe("ICS with changed occurrences", async () => {
  const ICAL = (await import("ical.js")).default;
  const { buildIcs } = await import("@/core/export/ics");
  it("weekly: EXDATE for a deleted occurrence and RECURRENCE-ID for a changed one", () => {
    const doc = emptyDocument();
    addEvent(doc, input({ title: "Class", start: G(2026, "M11", 23), recurrenceRules: [{ frequency: "weekly" }] }), "w");
    const d2 = gregorian.toEpochDay(G(2026, "M11", 30)), d3 = gregorian.toEpochDay(G(2026, "M12", 7));
    applyOccurrenceAction(doc, "w", "delete-this", d2, undefined, "n");
    applyOccurrenceAction(doc, "w", "edit-this", d3, input({ title: "Class (room 2)", start: G(2026, "M12", 8) }), "n");
    const comp = new ICAL.Component(ICAL.parse(buildIcs(doc.events, { range: { start: d2 - 30, end: d3 + 60 } })));
    const vevents = comp.getAllSubcomponents("vevent");
    expect(vevents).toHaveLength(2);
    const master = new ICAL.Event(vevents.find((v) => !v.hasProperty("recurrence-id"))!);
    const ex = new ICAL.Event(vevents.find((v) => v.hasProperty("recurrence-id"))!);
    master.relateException(ex);
    const it = master.iterator();
    const seen: string[] = [];
    for (let n = it.next(); n && seen.length < 4; n = it.next()) {
      const details = master.getOccurrenceDetails(n);
      seen.push(`${details.startDate.toString()} ${details.item.summary}`);
    }
    expect(seen).toEqual(["2026-11-23 Class", "2026-12-08 Class (room 2)", "2026-12-14 Class", "2026-12-21 Class"]);
  });
  it("materialised (Hebrew yearly): renamed and deleted occurrences are reflected", () => {
    const { doc, uid } = setup();
    applyOccurrenceAction(doc, uid, "edit-this", hd(H(5788, "M03", 15)), input({ title: "Party", start: H(5788, "M03", 15) }), "n");
    applyOccurrenceAction(doc, uid, "delete-this", hd(H(5789, "M03", 15)), undefined, "n");
    const ics = buildIcs(doc.events, { range: { start: hd(H(5787, "M01", 1)), end: hd(H(5791, "M01", 1)) } });
    const summaries = new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent").map((v) => String(v.getFirstPropertyValue("summary")));
    expect(summaries).toEqual(["Birthday", "Party", "Birthday"]);
  });
});
