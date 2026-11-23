/**
 * Pure operations on the event store document, shared by the server API and the
 * browser-only repository so both behave identically.
 */
import {
  COLLECTION_COLORS, createEvent, updateEvent,
  type CollectionInput, type EventInput, type EventStoreDocument, type UCEvent,
} from "./schema";

export class StoreError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) { super(message); }
}

function collectionFor(doc: EventStoreDocument, requested?: string): string {
  const id = requested ?? doc.collections[0].id;
  if (!doc.collections.some((c) => c.id === id)) throw new StoreError("collection not found", 400);
  return id;
}

export function addEvent(doc: EventStoreDocument, input: EventInput, uid: string, now = new Date()): UCEvent {
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
  const c = { id, name: input.name, color: input.color, created: now.toISOString() };
  doc.collections.push(c);
  return c;
}

export function changeCollection(doc: EventStoreDocument, id: string, input: CollectionInput) {
  const c = doc.collections.find((x) => x.id === id);
  if (!c) throw new StoreError("collection not found", 404);
  c.name = input.name;
  c.color = input.color;
  return c;
}

/** Deletes a collection and its events. The last remaining collection cannot be deleted. */
export function removeCollection(doc: EventStoreDocument, id: string): { removedEvents: number } {
  if (!doc.collections.some((c) => c.id === id)) throw new StoreError("collection not found", 404);
  if (doc.collections.length === 1) throw new StoreError("cannot delete the last calendar", 409);
  const before = doc.events.length;
  doc.collections = doc.collections.filter((c) => c.id !== id);
  doc.events = doc.events.filter((e) => e.collectionId !== id);
  return { removedEvents: before - doc.events.length };
}

export function nextColor(doc: EventStoreDocument): string {
  const used = new Set(doc.collections.map((c) => c.color));
  return COLLECTION_COLORS.find((c) => !used.has(c)) ?? COLLECTION_COLORS[doc.collections.length % COLLECTION_COLORS.length];
}
