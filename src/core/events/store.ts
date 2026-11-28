/**
 * Pure operations on the event store document, shared by the server API and the
 * browser-only repository so both behave identically.
 */
import { getCalendar } from "../calendars/registry";
import { expandEvent } from "./expand";
import {
  COLLECTION_COLORS, createEvent, DEFAULT_JEWISH_SETTINGS, isComputed, MAX_OVERRIDES, updateEvent,
  type Collection, type CollectionInput, type EventInput, type EventStoreDocument, type OccurrenceOverride, type UCEvent,
} from "./schema";

/** Hard caps so a public deployment cannot be filled up (storage cost / abuse). */
export const MAX_EVENTS = 5000;
export const MAX_COLLECTIONS = 50;

export class StoreError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) { super(message); }
}

/** The first calendar that holds events (computed calendars have none). */
export function defaultEventsCollection(doc: EventStoreDocument): string {
  return (doc.collections.find((c) => !isComputed(c)) ?? doc.collections[0]).id;
}

function collectionFor(doc: EventStoreDocument, requested?: string): string {
  const id = requested ?? defaultEventsCollection(doc);
  const c = doc.collections.find((x) => x.id === id);
  if (!c) throw new StoreError("collection not found", 400);
  if (isComputed(c)) throw new StoreError("events cannot be added to a computed calendar", 400);
  return id;
}

export function addEvent(doc: EventStoreDocument, input: EventInput, uid: string, now = new Date()): UCEvent {
  if (doc.events.length >= MAX_EVENTS) throw new StoreError(`limit of ${MAX_EVENTS} events reached`, 409);
  const e = createEvent({ ...input, collectionId: collectionFor(doc, input.collectionId) }, uid, now);
  doc.events.push(e);
  return e;
}

export function replaceEvent(doc: EventStoreDocument, uid: string, input: EventInput, now = new Date()): UCEvent {
  const i = doc.events.findIndex((e) => e.uid === uid);
  if (i < 0) throw new StoreError("event not found", 404);
  const collectionId = collectionFor(doc, input.collectionId ?? doc.events[i].collectionId);
  doc.events[i] = updateEvent(doc.events[i], { ...input, collectionId }, now);
  return doc.events[i];
}

export function removeEvent(doc: EventStoreDocument, uid: string): void {
  const before = doc.events.length;
  doc.events = doc.events.filter((e) => e.uid !== uid);
  if (doc.events.length === before) throw new StoreError("event not found", 404);
}

export function addCollection(doc: EventStoreDocument, input: CollectionInput, id: string, now = new Date()) {
  if (doc.collections.length >= MAX_COLLECTIONS) throw new StoreError(`limit of ${MAX_COLLECTIONS} calendars reached`, 409);
  const c: Collection = input.kind === "jewish"
    ? { id, name: input.name, color: input.color, created: now.toISOString(), kind: "jewish", jewish: input.jewish ?? { ...DEFAULT_JEWISH_SETTINGS, categories: [...DEFAULT_JEWISH_SETTINGS.categories] } }
    : { id, name: input.name, color: input.color, created: now.toISOString() };
  doc.collections.push(c);
  return c;
}

export function changeCollection(doc: EventStoreDocument, id: string, input: CollectionInput) {
  const c = doc.collections.find((x) => x.id === id);
  if (!c) throw new StoreError("collection not found", 404);
  if (input.kind && input.kind !== (c.kind ?? "events")) throw new StoreError("a calendar's kind cannot change", 400);
  c.name = input.name;
  c.color = input.color;
  if (input.jewish) {
    if (!isComputed(c)) throw new StoreError("only computed calendars have Jewish-calendar settings", 400);
    c.jewish = input.jewish;
  }
  return c;
}

/** Deletes a collection and its events. The last calendar that holds events cannot be deleted;
 *  computed calendars can always be removed (for a clean calendar). */
export function removeCollection(doc: EventStoreDocument, id: string): { removedEvents: number } {
  const target = doc.collections.find((c) => c.id === id);
  if (!target) throw new StoreError("collection not found", 404);
  if (!isComputed(target) && doc.collections.filter((c) => !isComputed(c)).length === 1) throw new StoreError("cannot delete the last calendar", 409);
  const before = doc.events.length;
  doc.collections = doc.collections.filter((c) => c.id !== id);
  doc.events = doc.events.filter((e) => e.collectionId !== id);
  return { removedEvents: before - doc.events.length };
}

export function nextColor(doc: EventStoreDocument): string {
  const used = new Set(doc.collections.map((c) => c.color));
  return COLLECTION_COLORS.find((c) => !used.has(c)) ?? COLLECTION_COLORS[doc.collections.length % COLLECTION_COLORS.length];
}

// ── Recurring events: act on one occurrence, or on it and all that follow (Apple Calendar's model) ──

export type OccurrenceAction = "edit-this" | "edit-future" | "delete-this" | "delete-future";
export const OCCURRENCE_ACTIONS: OccurrenceAction[] = ["edit-this", "edit-future", "delete-this", "delete-future"];

function touch(e: UCEvent, now: Date) {
  e.updated = now.toISOString();
  e.sequence += 1;
}

/**
 * - edit-this:     store the differences (title, notes, day) as an override of that occurrence only.
 * - delete-this:   exclude that occurrence.
 * - edit-future:   end the series the day before the occurrence and start a new series from the edited
 *                  values (on the first occurrence this simply edits the whole series).
 * - delete-future: end the series the day before (on the first occurrence: delete the event).
 * The whole operation runs on one document, so it is saved atomically.
 */
export function applyOccurrenceAction(
  doc: EventStoreDocument, uid: string, action: OccurrenceAction, recurrenceId: number,
  input: EventInput | undefined, newUid: string, now = new Date(),
): { event?: UCEvent; created?: UCEvent; deleted?: boolean } {
  const i = doc.events.findIndex((e) => e.uid === uid);
  if (i < 0) throw new StoreError("event not found", 404);
  const ev = doc.events[i];
  const rule = ev.recurrenceRules?.[0];
  if (!rule) throw new StoreError("event does not repeat", 400);
  const plain: UCEvent = { ...ev, recurrenceOverrides: undefined };
  if (!expandEvent(plain, { start: recurrenceId, end: recurrenceId + 1 }).some((o) => o.epochDay === recurrenceId))
    throw new StoreError("no such occurrence", 400);
  const cal = getCalendar(ev.start.calendar);
  const isFirst = expandEvent(plain, { start: cal.toEpochDay(ev.start), end: recurrenceId }).length === 0;
  const key = String(recurrenceId);

  if (action === "delete-this") {
    ev.recurrenceOverrides = { ...(ev.recurrenceOverrides ?? {}), [key]: { excluded: true } };
    touch(ev, now);
    return { event: ev };
  }

  if (action === "edit-this") {
    if (!input) throw new StoreError("input required", 400);
    const ov: OccurrenceOverride = {};
    if (input.title !== ev.title) ov.title = input.title;
    if ((input.description ?? "") !== (ev.description ?? "")) ov.description = input.description ?? "";
    if (getCalendar(input.start.calendar).toEpochDay(input.start) !== recurrenceId) ov.start = { ...input.start };
    const next = { ...(ev.recurrenceOverrides ?? {}) };
    if (Object.keys(ov).length) next[key] = ov; else delete next[key];
    if (Object.keys(next).length > MAX_OVERRIDES) throw new StoreError("too many changed occurrences", 409);
    ev.recurrenceOverrides = Object.keys(next).length ? next : undefined;
    touch(ev, now);
    return { event: ev };
  }

  // Future actions on the first occurrence apply to the whole series.
  if (isFirst) {
    if (action === "delete-future") { removeEvent(doc, uid); return { deleted: true }; }
    if (!input) throw new StoreError("input required", 400);
    return { event: replaceEvent(doc, uid, input, now) };
  }

  // End the existing series the day before this occurrence; drop its overrides from here on.
  ev.recurrenceRules = [{ ...rule, until: cal.fromEpochDay(recurrenceId - 1) }];
  if (ev.recurrenceOverrides) {
    const kept = Object.fromEntries(Object.entries(ev.recurrenceOverrides).filter(([id]) => Number(id) < recurrenceId));
    ev.recurrenceOverrides = Object.keys(kept).length ? kept : undefined;
  }
  touch(ev, now);
  if (action === "delete-future") return { event: ev };

  if (!input) throw new StoreError("input required", 400);
  const created = addEvent(doc, { ...input, collectionId: input.collectionId ?? ev.collectionId }, newUid, now);
  return { event: ev, created };
}
