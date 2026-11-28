/**
 * Export of any chosen calendars:
 *  - ICS: opens in any calendar app — regular calendars with their events, computed calendars with
 *    their generated entries (holidays …). Same builder as the live feed.
 *  - JSON: lossless backup in Ittim's own schema (Hebrew dates, rules, and computed calendars' settings).
 */
import type { Locale } from "@/core/calendars/types";
import type { Collection, EventStoreDocument } from "@/core/events/schema";
import { buildCollectionsIcs } from "@/core/export/ics";
import { todayEpochDay } from "@/core/time/epochDay";

function download(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** ASCII-only file names: some browsers and systems mangle non-Latin download names. */
const slug = (s: string) => {
  const ascii = s.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return ascii ? `universal-calendar-${ascii}`.replace(/^universal-calendar-universal-calendar/, "universal-calendar") : "universal-calendar";
};
const stamp = () => new Date().toISOString().slice(0, 10);

/** `ids` null = every calendar. Dates cover 5 years back and 10 years ahead. */
export function exportIcs(doc: EventStoreDocument, ids: string[] | null, name: string, locale: Locale) {
  const today = todayEpochDay();
  const body = buildCollectionsIcs(doc, ids, { range: { start: today - 5 * 366, end: today + 10 * 366 }, calendarName: name, locale });
  download(`${slug(name)}-${stamp()}.ics`, "text/calendar;charset=utf-8", body);
}

export function exportJson(doc: EventStoreDocument, collections: Collection[], name: string) {
  const ids = new Set(collections.map((c) => c.id));
  const out = {
    schemaVersion: doc.schemaVersion,
    exported: new Date().toISOString(),
    collections,
    events: doc.events.filter((e) => ids.has(e.collectionId)),
  };
  download(`${slug(name)}-${stamp()}.json`, "application/json", JSON.stringify(out, null, 2) + "\n");
}
