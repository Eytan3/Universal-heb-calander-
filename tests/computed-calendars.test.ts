import { describe, expect, it } from "vitest";
import {
  emptyDocument, parseDocument, validateCollectionInput, JEWISH_COLLECTION_ID, SCHEMA_VERSION,
  type EventStoreDocument,
} from "@/core/events/schema";
import { addCollection, addEvent, changeCollection, removeCollection } from "@/core/events/store";
import { buildCollectionsIcs, buildHolidaysIcs } from "@/core/export/ics";
import { importBackup } from "@/core/events/import";
import { jewishHolidays } from "@/core/holidays/registry";
import { gregorian } from "@/core/calendars/gregorian";

const day = (y: number, m: number, d: number) => gregorian.toEpochDay({ year: y, monthCode: `M${String(m).padStart(2, "0")}`, day: d });
const range = { start: day(2027, 1, 1), end: day(2028, 1, 1) };
const opts = { range, calendarName: "Test", locale: "he" as const };

function sampleDoc(): EventStoreDocument {
  const doc = emptyDocument();
  addEvent(doc, { title: "Dentist", start: { calendar: "gregory", year: 2027, monthCode: "M03", day: 4 } }, "e1");
  addEvent(doc, {
    title: "יום הולדת לאמא", start: { calendar: "hebrew", year: 5723, monthCode: "M07", day: 29 },
    recurrenceRules: [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: "hebrew" }],
  }, "e2");
  return doc;
}

/** Structural ICS checks every client relies on. */
function assertValidIcs(ics: string) {
  expect(ics.endsWith("\r\n")).toBe(true);
  const lines = ics.split("\r\n").slice(0, -1);
  expect(lines[0]).toBe("BEGIN:VCALENDAR");
  expect(lines.at(-1)).toBe("END:VCALENDAR");
  const enc = new TextEncoder();
  for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
  const unfolded = ics.replace(/\r\n /g, "").split("\r\n");
  expect(unfolded.filter((l) => l === "BEGIN:VEVENT").length).toBe(unfolded.filter((l) => l === "END:VEVENT").length);
  const uids = unfolded.filter((l) => l.startsWith("UID:"));
  // A UID may repeat only for RECURRENCE-ID instances; none here.
  expect(new Set(uids).size).toBe(uids.length);
  return unfolded;
}

describe("computed calendars (holidays as a calendar)", () => {
  it("every new document has one computed Jewish calendar with the default settings", () => {
    const doc = emptyDocument();
    expect(doc.schemaVersion).toBe(3);
    expect(doc.collections.map((c) => [c.id, c.kind ?? "events"])).toEqual([["personal", "events"], [JEWISH_COLLECTION_ID, "jewish"]]);
    expect(doc.collections[1].jewish).toEqual({ region: "il", categories: ["major", "minor", "fast", "modern"] });
  });

  it("migrates v1 and v2 documents by adding the computed calendar once", () => {
    const v2 = { schemaVersion: 2, collections: [{ id: "personal", name: "", color: "#3949ab", created: "x" }], events: [] };
    const m = parseDocument(v2);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.collections.filter((c) => c.kind === "jewish")).toHaveLength(1);
    expect(parseDocument(JSON.parse(JSON.stringify(m))).collections).toHaveLength(2); // v3 stays as is
    expect(parseDocument({ schemaVersion: 1, events: [] }).collections.map((c) => c.id)).toEqual(["personal", JEWISH_COLLECTION_ID]);
  });

  it("a computed calendar holds no events, can always be deleted, and never changes kind", () => {
    const doc = emptyDocument();
    expect(() => addEvent(doc, { title: "x", start: { calendar: "gregory", year: 2027, monthCode: "M01", day: 1 }, collectionId: JEWISH_COLLECTION_ID }, "x"))
      .toThrow(/computed/);
    // New events go to the first regular calendar even if a computed one is first in the list
    doc.collections.reverse();
    expect(addEvent(doc, { title: "y", start: { calendar: "gregory", year: 2027, monthCode: "M01", day: 1 } }, "y").collectionId).toBe("personal");
    expect(() => changeCollection(doc, JEWISH_COLLECTION_ID, { name: "", color: "#000000", kind: "events" })).toThrow(/kind/);
    expect(() => changeCollection(doc, "personal", { name: "", color: "#000000", jewish: { region: "il", categories: [] } })).toThrow(/computed/);
    expect(() => removeCollection(doc, "personal")).toThrow(/last/); // the only regular calendar
    removeCollection(doc, JEWISH_COLLECTION_ID); // a clean calendar
    expect(doc.collections.map((c) => c.id)).toEqual(["personal"]);
  });

  it("validates settings strictly and keeps categories in canonical order", () => {
    expect(validateCollectionInput({ name: "", color: "#5e35b1", kind: "jewish", jewish: { region: "il", categories: ["fast", "major"] } }))
      .toMatchObject({ ok: true, value: { jewish: { categories: ["major", "fast"] } } });
    expect(validateCollectionInput({ name: "", color: "#5e35b1", jewish: { region: "mars", categories: [] } }).ok).toBe(false);
    expect(validateCollectionInput({ name: "", color: "#5e35b1", jewish: { region: "il", categories: ["birthdays"] } }).ok).toBe(false);
    expect(validateCollectionInput({ name: "", color: "#5e35b1", kind: "nope" }).ok).toBe(false);
  });
});

describe("export of chosen calendars (.ics)", () => {
  it("all calendars: the user's events and the computed holidays, in one valid file", () => {
    const lines = assertValidIcs(buildCollectionsIcs(sampleDoc(), null, opts));
    expect(lines.some((l) => l === "SUMMARY:Dentist")).toBe(true);
    expect(lines.some((l) => l.startsWith("SUMMARY:יום הולדת לאמא"))).toBe(true);
    expect(lines.some((l) => l.includes("פסח"))).toBe(true);
    expect(lines.filter((l) => l === "BEGIN:VCALENDAR")).toHaveLength(1);
  });

  it("only the chosen calendars", () => {
    const doc = sampleDoc();
    const onlyMine = assertValidIcs(buildCollectionsIcs(doc, ["personal"], opts));
    expect(onlyMine.some((l) => l.startsWith("UID:holiday."))).toBe(false);
    expect(onlyMine.some((l) => l === "SUMMARY:Dentist")).toBe(true);
    const onlyHolidays = assertValidIcs(buildCollectionsIcs(doc, [JEWISH_COLLECTION_ID], opts));
    expect(onlyHolidays.some((l) => l === "SUMMARY:Dentist")).toBe(false);
    expect(onlyHolidays.filter((l) => l.startsWith("UID:holiday.")).length).toBeGreaterThan(20);
  });

  it("each computed calendar uses its own settings, and shared holidays are listed once", () => {
    const doc = emptyDocument();
    addCollection(doc, { name: "Diaspora", color: "#00897b", kind: "jewish", jewish: { region: "diaspora", categories: ["major"] } }, "dia");
    const il = assertValidIcs(buildCollectionsIcs(doc, [JEWISH_COLLECTION_ID], opts));
    const dia = assertValidIcs(buildCollectionsIcs(doc, ["dia"], opts));
    expect(il.some((l) => l.startsWith("UID:holiday.pesach-8."))).toBe(false);
    expect(dia.some((l) => l.startsWith("UID:holiday.pesach-8."))).toBe(true);
    // Fasts were not chosen for this calendar (the default one includes them)
    expect(il.some((l) => l.startsWith("UID:holiday.tisha-bav."))).toBe(true);
    expect(dia.some((l) => l.startsWith("UID:holiday.tisha-bav.") || l.startsWith("UID:holiday.tzom-"))).toBe(false);
    // Both together: Rosh Hashana appears in both sets but only once in the file (the UID check enforces it)
    const both = assertValidIcs(buildCollectionsIcs(doc, null, opts));
    expect(both.filter((l) => l.startsWith("UID:holiday.rosh-hashana-1.")).length).toBe(1);
  });

  it("the computed calendar's feed has the same UIDs as the old holidays feed (no duplicates after switching)", () => {
    const doc = emptyDocument();
    const old = buildHolidaysIcs(jewishHolidays.occurrences(range, { region: "il", categories: ["major", "minor", "fast", "modern"] }), { calendarName: "x", locale: "he" });
    const uids = (s: string) => new Set(s.replace(/\r\n /g, "").split("\r\n").filter((l) => l.startsWith("UID:")));
    expect(uids(buildCollectionsIcs(doc, [JEWISH_COLLECTION_ID], opts))).toEqual(uids(old));
  });

  it("escapes and folds long Hebrew text safely", () => {
    const doc = emptyDocument();
    addEvent(doc, { title: "שורה ארוכה מאוד, עם פסיק; נקודה-פסיק ועוד ".repeat(4), description: "א\nב", start: { calendar: "gregory", year: 2027, monthCode: "M05", day: 5 } }, "long");
    const ics = buildCollectionsIcs(doc, ["personal"], opts);
    assertValidIcs(ics);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("\\, עם פסיק\\; נקודה");
  });
});

describe("backup (.json) round-trip with computed calendars", () => {
  it("export → import into an empty document restores events and calendar settings", () => {
    const doc = sampleDoc();
    addCollection(doc, { name: "ניו יורק", color: "#00897b", kind: "jewish", jewish: { region: "diaspora", categories: ["major", "fast"] } }, "ny");
    const file = JSON.parse(JSON.stringify({ schemaVersion: doc.schemaVersion, exported: "now", collections: doc.collections, events: doc.events }));
    const target = emptyDocument();
    let n = 0;
    const r = importBackup(target, file, () => `n${++n}`);
    expect(r.errors).toEqual([]);
    expect(r.added).toBe(2);
    expect(target.events.map((e) => e.title).sort()).toEqual(["Dentist", "יום הולדת לאמא"]);
    expect(target.events.find((e) => e.title === "יום הולדת לאמא")!.start).toEqual({ calendar: "hebrew", year: 5723, monthCode: "M07", day: 29 });
    expect(target.collections.find((c) => c.name === "ניו יורק")).toMatchObject({ kind: "jewish", jewish: { region: "diaspora", categories: ["major", "fast"] } });
    // Importing again changes nothing
    const again = importBackup(target, file, () => `m${++n}`);
    expect(again).toMatchObject({ added: 0, calendarsCreated: 0 });
  });
});
