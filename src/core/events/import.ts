/**
 * Import of an Ittim backup (.json, the format Settings → Export writes) into an existing document.
 * Adds to what is there; never deletes or overwrites.
 *  - Calendars are matched by name (case and surrounding spaces ignored); missing ones are created.
 *    The unnamed default calendar maps to the target's first calendar.
 *  - Every event is validated like a new event; invalid ones are reported and skipped.
 *  - An event already present (same calendar, title, start date and rules) is skipped, so importing
 *    the same file twice does not create duplicates.
 *  - Events get new UIDs; per-occurrence changes (recurrenceOverrides) are kept.
 */
import {
  COLLECTION_COLORS, isComputed, MAX_OVERRIDES, validateCollectionInput, validateEventInput, validateJewishSettings,
  type Collection, type EventStoreDocument, type OccurrenceOverride, type UCEvent,
} from "./schema";
import { addCollection, addEvent, defaultEventsCollection, MAX_COLLECTIONS, MAX_EVENTS } from "./store";

export interface ImportResult {
  added: number;
  skipped: number;
  calendarsCreated: number;
  /** Human-readable problems with individual entries (the rest is still imported). */
  errors: string[];
}

interface FileCollection { id?: unknown; name?: unknown; color?: unknown; kind?: unknown; jewish?: unknown }
interface FileShape { schemaVersion?: unknown; collections?: unknown; events?: unknown }

const norm = (s: string) => s.trim().toLocaleLowerCase();

function eventKey(e: Pick<UCEvent, "collectionId" | "title" | "start" | "recurrenceRules"> & { startTime?: string }): string {
  const s = e.start;
  return JSON.stringify([e.collectionId, e.title.trim(), s.calendar, s.year, s.monthCode, s.day, e.startTime ?? "", e.recurrenceRules ?? []]);
}

function cleanOverrides(raw: unknown): Record<string, OccurrenceOverride> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, OccurrenceOverride> = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_OVERRIDES) break;
    if (!/^-?\d{1,7}$/.test(key) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const o: OccurrenceOverride = {};
    if (v.excluded === true) o.excluded = true;
    if (typeof v.title === "string" && v.title.trim() && v.title.length <= 200) o.title = v.title.trim();
    if (typeof v.description === "string" && v.description.length <= 5000) o.description = v.description;
    if (v.start && validateEventInput({ title: "x", start: v.start }).ok) o.start = v.start as OccurrenceOverride["start"];
    if (typeof v.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.startTime)) o.startTime = v.startTime;
    if (Number.isInteger(v.durationMinutes) && (v.durationMinutes as number) >= 0 && (v.durationMinutes as number) <= 10080) o.durationMinutes = v.durationMinutes as number;
    if (Object.keys(o).length) { out[key] = o; n++; }
  }
  return n ? out : undefined;
}

export function importBackup(doc: EventStoreDocument, raw: unknown, newId: () => string, now = new Date()): ImportResult {
  const file = (raw ?? {}) as FileShape;
  if (!Array.isArray(file.events)) throw new Error("not an Ittim backup file (no events list)");
  const result: ImportResult = { added: 0, skipped: 0, calendarsCreated: 0, errors: [] };

  // ── Calendars ──
  const map = new Map<string, string>(); // file collection id → target collection id
  const fileCollections = Array.isArray(file.collections) ? (file.collections as FileCollection[]) : [];
  for (const fc of fileCollections) {
    const fileId = typeof fc.id === "string" ? fc.id : "";
    const name = typeof fc.name === "string" ? fc.name.trim() : "";
    const computed = fc.kind === "jewish";
    if (computed) {
      // A computed calendar: matched by kind and name (or the unnamed built-in one); created with its settings.
      const s = validateJewishSettings(fc.jewish);
      const same = doc.collections.find((c) => isComputed(c) && norm(c.name) === norm(name));
      if (same) continue;
      if (doc.collections.length >= MAX_COLLECTIONS) { result.errors.push(`calendar "${name}": limit of ${MAX_COLLECTIONS} calendars reached`); continue; }
      const color = typeof fc.color === "string" && validateCollectionInput({ name, color: fc.color }).ok ? fc.color : COLLECTION_COLORS[5];
      addCollection(doc, { name: name.slice(0, 60), color, kind: "jewish", ...(s.ok ? { jewish: s.value } : {}) }, newId(), now);
      result.calendarsCreated++;
      continue;
    }
    const eventCollections = doc.collections.filter((c) => !isComputed(c));
    let target: Collection | undefined = name ? eventCollections.find((c) => norm(c.name) === norm(name)) : eventCollections[0];
    if (!target) {
      if (doc.collections.length >= MAX_COLLECTIONS) {
        result.errors.push(`calendar "${name}": limit of ${MAX_COLLECTIONS} calendars reached, its events go to "${eventCollections[0].name || "default"}"`);
        target = eventCollections[0];
      } else {
        const used = new Set(doc.collections.map((c) => c.color));
        const color = typeof fc.color === "string" && validateCollectionInput({ name, color: fc.color }).ok
          ? fc.color : COLLECTION_COLORS.find((c) => !used.has(c)) ?? COLLECTION_COLORS[0];
        target = addCollection(doc, { name: name.slice(0, 60), color }, newId(), now);
        result.calendarsCreated++;
      }
    }
    if (fileId) map.set(fileId, target.id);
  }

  // ── Events ──
  const existing = new Set(doc.events.map(eventKey));
  for (const raw of file.events as Record<string, unknown>[]) {
    const label = typeof raw?.title === "string" ? `"${raw.title.slice(0, 60)}"` : "(untitled)";
    const collectionId = (typeof raw?.collectionId === "string" && map.get(raw.collectionId)) || defaultEventsCollection(doc);
    const v = validateEventInput({
      title: raw?.title, description: raw?.description ?? undefined, start: raw?.start,
      recurrenceRules: raw?.recurrenceRules, collectionId,
      ...(raw?.showWithoutTime === false
        ? { showWithoutTime: false, startTime: raw.startTime, durationMinutes: raw.durationMinutes, timeZone: raw.timeZone }
        : {}),
    });
    if (!v.ok) { result.errors.push(`${label}: ${v.errors.join(", ")}`); continue; }
    const key = eventKey({ ...v.value, collectionId });
    if (existing.has(key)) { result.skipped++; continue; }
    if (doc.events.length >= MAX_EVENTS) { result.errors.push(`limit of ${MAX_EVENTS} events reached; the rest was not imported`); break; }
    const ev = addEvent(doc, { ...v.value, collectionId }, newId(), now);
    const overrides = cleanOverrides(raw?.recurrenceOverrides);
    if (overrides && ev.recurrenceRules?.length) ev.recurrenceOverrides = overrides;
    existing.add(key);
    result.added++;
  }
  return result;
}
