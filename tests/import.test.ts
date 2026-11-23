import { describe, expect, it } from "vitest";
import { emptyDocument, createEvent, type EventStoreDocument } from "@/core/events/schema";
import { addCollection, addEvent } from "@/core/events/store";
import { importBackup } from "@/core/events/import";

let n = 0;
const id = () => `id${++n}`;
const yearly = (rscale: "hebrew" | "gregory") => [{ "@type": "RecurrenceRule" as const, frequency: "yearly" as const, rscale }];

function backup(): unknown {
  const src = emptyDocument();
  const bd = addCollection(src, { name: "ימי הולדת", color: "#c2185b" }, "bd");
  addEvent(src, { title: "יומולדת לאמא", start: { calendar: "hebrew", year: 5723, monthCode: "M07", day: 29 }, recurrenceRules: yearly("hebrew"), collectionId: bd.id }, "e1");
  const g = addEvent(src, { title: "יומולדת לגיל", start: { calendar: "gregory", year: 2021, monthCode: "M01", day: 12 }, recurrenceRules: yearly("gregory"), collectionId: bd.id }, "e2");
  g.recurrenceOverrides = { "20000": { excluded: true }, "bad key": { excluded: true } } as never;
  addEvent(src, { title: "In default", start: { calendar: "gregory", year: 2026, monthCode: "M03", day: 1 } }, "e3");
  return JSON.parse(JSON.stringify({ schemaVersion: 2, exported: "x", collections: src.collections, events: src.events }));
}

describe("import of a backup", () => {
  it("creates missing calendars, adds events with new uids and keeps overrides", () => {
    const doc: EventStoreDocument = emptyDocument();
    const r = importBackup(doc, backup(), id);
    expect(r).toMatchObject({ added: 3, skipped: 0, calendarsCreated: 1, errors: [] });
    const bd = doc.collections.find((c) => c.name === "ימי הולדת")!;
    expect(bd.color).toBe("#c2185b");
    const mom = doc.events.find((e) => e.title === "יומולדת לאמא")!;
    expect(mom.collectionId).toBe(bd.id);
    expect(mom.start).toEqual({ calendar: "hebrew", year: 5723, monthCode: "M07", day: 29 });
    expect(mom.uid).not.toBe("e1");
    expect(doc.events.find((e) => e.title === "יומולדת לגיל")!.recurrenceOverrides).toEqual({ "20000": { excluded: true } });
    expect(doc.events.find((e) => e.title === "In default")!.collectionId).toBe(doc.collections[0].id);
  });

  it("is idempotent: importing the same file again adds nothing", () => {
    const doc = emptyDocument();
    importBackup(doc, backup(), id);
    const r = importBackup(doc, backup(), id);
    expect(r).toMatchObject({ added: 0, skipped: 3, calendarsCreated: 0 });
    expect(doc.events).toHaveLength(3);
    expect(doc.collections).toHaveLength(2);
  });

  it("matches existing calendars by name and never touches existing events", () => {
    const doc = emptyDocument();
    addCollection(doc, { name: " ימי הולדת ", color: "#00897b" }, "mine");
    doc.events.push(createEvent({ title: "Existing", start: { calendar: "gregory", year: 2026, monthCode: "M05", day: 5 } }, "keep"));
    importBackup(doc, backup(), id);
    expect(doc.collections).toHaveLength(2);
    expect(doc.events.filter((e) => e.collectionId === "mine")).toHaveLength(2);
    expect(doc.events.find((e) => e.uid === "keep")!.title).toBe("Existing");
  });

  it("reports invalid entries and imports the rest; rejects non-backup files", () => {
    const doc = emptyDocument();
    const file = backup() as { events: unknown[] };
    file.events.push({ title: "", start: { calendar: "gregory", year: 2026, monthCode: "M02", day: 30 } });
    const r = importBackup(doc, file, id);
    expect(r.added).toBe(3);
    expect(r.errors).toHaveLength(1);
    expect(() => importBackup(doc, { hello: 1 }, id)).toThrow(/not an Ittim backup/);
  });
});
