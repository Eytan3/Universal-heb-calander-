/**
 * Export of the user's own events (never built-in holidays):
 *  - ICS: opens in any calendar app (dates computed; daily/weekly as RRULE).
 *  - JSON: lossless backup in Universal Calendar's own schema (keeps Hebrew dates and rules).
 */
import type { Collection, EventStoreDocument, UCEvent } from "@/core/events/schema";
import { buildIcs } from "@/core/export/ics";
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

const slug = (s: string) => s.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "calendar";
const stamp = () => new Date().toISOString().slice(0, 10);

export function exportIcs(events: UCEvent[], name: string) {
  const today = todayEpochDay();
  // Materialised dates cover 5 years back and 10 years ahead.
  const body = buildIcs(events, { range: { start: today - 5 * 366, end: today + 10 * 366 }, calendarName: name });
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
