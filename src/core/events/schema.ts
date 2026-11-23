/**
 * Calendar-neutral event model, schema version 1.
 *
 * Shaped after JSCalendar (RFC 8984 / draft-ietf-calext-jscalendarbis): "@type",
 * "uid", "title", "description", "showWithoutTime", "recurrenceRules" with
 * "rscale" and "skip" (the JSCalendar mapping of RFC 7529).
 *
 * Intentional departure: JSCalendar's `start` is an ISO LocalDateTime string,
 * which would make the Gregorian/ISO calendar the source of truth. Here `start`
 * is a structured date in the event's own calendar. See ARCHITECTURE.md.
 *
 * No generated occurrence dates are ever stored.
 */
import { getCalendar, isCalendarId } from "../calendars/registry";
import type { CalendarDate, CalendarId, SkipPolicy } from "../calendars/types";

export const SCHEMA_VERSION = 2 as const;

/**
 * A user calendar ("יומן"): a named, coloured collection of events with its own ICS feed.
 * (JMAP for Calendars calls this object a "Calendar"; here "calendar" already means a
 * calendar *system* such as hebrew/gregory, so the code calls it a collection.)
 */
export interface Collection {
  id: string;
  /** Empty for the default collection until renamed; the UI shows a localised default. */
  name: string;
  /** #rrggbb */
  color: string;
  created: string;
}

export const DEFAULT_COLLECTION_ID = "personal";
export const COLLECTION_COLORS = ["#3949ab", "#00897b", "#e65100", "#c2185b", "#6d4c41", "#5e35b1", "#2e7d32", "#0277bd"];

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "yearly"];

export interface RecurrenceRule {
  "@type": "RecurrenceRule";
  /**
   * daily / weekly: every N days / weeks from the start day (identical in every calendar).
   * monthly: the same day-of-month every N months *of the event's calendar* (Hebrew months for Hebrew events).
   * yearly: the same month and day every N years of the event's calendar.
   */
  frequency: Frequency;
  /** Calendar in which the rule is evaluated. MUST equal start.calendar in v1. */
  rscale: CalendarId;
  /** Every N units of the frequency (default 1). */
  interval?: number;
  /** RFC 7529 SKIP for dates missing in a month/year (monthly and yearly only). Default "omit" (RFC 7529 default). */
  skip?: SkipPolicy;
  /**
   * Repeats begin on this date (in the rule's calendar). The series stays anchored to `start`
   * (e.g. a birth date keeps its meaning), but no repeats are generated between `start` and
   * `from` — so an old event made recurring today does not fill the past. The original
   * occurrence on `start` itself is kept. Absent = repeats from `start`.
   * (Departure from JSCalendar, which has no such field; see ARCHITECTURE.md.)
   */
  from?: CalendarDate;
  /** "End Repeat": the last day repeats may occur on (inclusive), in the rule's calendar. Absent = never ends. */
  until?: CalendarDate;
}

export interface UCEvent {
  "@type": "Event";
  uid: string;
  title: string;
  description?: string;
  /** JSCalendar's all-day flag. v1 supports all-day events only. */
  showWithoutTime: true;
  start: CalendarDate;
  recurrenceRules?: RecurrenceRule[];
  /** The user calendar (collection) this event belongs to. */
  collectionId: string;
  /** RFC 3339 UTC instants. */
  created: string;
  updated: string;
  /** Incremented on every change; exported as iCalendar SEQUENCE. */
  sequence: number;
}

export interface EventStoreDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  collections: Collection[];
  events: UCEvent[];
}

/** Fields a client may set. Server-managed fields (uid, created, updated, sequence) are excluded. */
export interface EventInput {
  title: string;
  description?: string;
  start: CalendarDate;
  recurrenceRules?: RecurrenceRule[];
  /** Defaults to the first collection; existence is checked against the store. */
  collectionId?: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const SKIPS: SkipPolicy[] = ["omit", "backward", "forward"];

export function validateEventInput(raw: unknown): ValidationResult<EventInput> {
  const errors: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;

  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) errors.push("title is required");
  if (title.length > 200) errors.push("title must be at most 200 characters");

  let description: string | undefined;
  if (o.description !== undefined && o.description !== null && o.description !== "") {
    if (typeof o.description !== "string") errors.push("description must be a string");
    else if (o.description.length > 5000) errors.push("description must be at most 5000 characters");
    else description = o.description;
  }

  const s = (o.start ?? {}) as Record<string, unknown>;
  let start: CalendarDate | undefined;
  if (!isCalendarId(s.calendar)) errors.push("start.calendar must be one of the supported calendars");
  else {
    const candidate = { year: Number(s.year), monthCode: String(s.monthCode), day: Number(s.day) };
    if (!getCalendar(s.calendar).isValid(candidate)) errors.push(`start is not a valid ${s.calendar} date`);
    else start = { calendar: s.calendar, ...candidate };
  }

  let recurrenceRules: RecurrenceRule[] | undefined;
  if (o.recurrenceRules !== undefined && o.recurrenceRules !== null) {
    if (!Array.isArray(o.recurrenceRules)) errors.push("recurrenceRules must be an array");
    else if (o.recurrenceRules.length > 1) errors.push("v1 supports at most one recurrence rule");
    else if (o.recurrenceRules.length === 1) {
      const r = o.recurrenceRules[0] as Record<string, unknown>;
      const frequency = r.frequency as Frequency;
      if (!FREQUENCIES.includes(frequency)) errors.push("recurrence frequency must be daily, weekly, monthly or yearly");
      if (start && r.rscale !== undefined && r.rscale !== start.calendar)
        errors.push("recurrence rscale must equal start.calendar");
      const interval = r.interval === undefined ? 1 : Number(r.interval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 1000) errors.push("interval must be 1–1000");
      const skip = (r.skip ?? "omit") as SkipPolicy;
      if (!SKIPS.includes(skip)) errors.push("skip must be omit, backward or forward");
      let from: CalendarDate | undefined;
      if (r.from !== undefined && r.from !== null && start) {
        const f = r.from as Record<string, unknown>;
        const cand = { year: Number(f.year), monthCode: String(f.monthCode), day: Number(f.day) };
        const cal = getCalendar(start.calendar);
        if (f.calendar !== start.calendar || !cal.isValid(cand)) errors.push("recurrence 'from' must be a valid date in the event's calendar");
        else if (cal.toEpochDay(cand) > cal.toEpochDay(start)) from = { calendar: start.calendar, ...cand }; // ≤ start is meaningless: drop it
      }
      let until: CalendarDate | undefined;
      if (r.until !== undefined && r.until !== null && start) {
        const u = r.until as Record<string, unknown>;
        const cand = { year: Number(u.year), monthCode: String(u.monthCode), day: Number(u.day) };
        const cal = getCalendar(start.calendar);
        if (u.calendar !== start.calendar || !cal.isValid(cand)) errors.push("recurrence 'until' must be a valid date in the event's calendar");
        else if (cal.toEpochDay(cand) < cal.toEpochDay(start)) errors.push("recurrence 'until' must not be before the start");
        else until = { calendar: start.calendar, ...cand };
      }
      if (start && errors.length === 0)
        recurrenceRules = [{
          "@type": "RecurrenceRule", frequency, rscale: start.calendar, interval,
          ...(frequency === "monthly" || frequency === "yearly" ? { skip } : {}),
          ...(from ? { from } : {}),
          ...(until ? { until } : {}),
        }];
    }
  }

  let collectionId: string | undefined;
  if (o.collectionId !== undefined && o.collectionId !== null && o.collectionId !== "") {
    if (typeof o.collectionId !== "string" || !UID_PATTERN.test(o.collectionId)) errors.push("collectionId is invalid");
    else collectionId = o.collectionId;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { title, description, start: start!, recurrenceRules, ...(collectionId ? { collectionId } : {}) } };
}

export function createEvent(input: EventInput, uid: string, now: Date = new Date()): UCEvent {
  const ts = now.toISOString();
  return {
    "@type": "Event",
    uid,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    showWithoutTime: true,
    start: { ...input.start },
    ...(input.recurrenceRules?.length ? { recurrenceRules: input.recurrenceRules } : {}),
    collectionId: input.collectionId ?? DEFAULT_COLLECTION_ID,
    created: ts,
    updated: ts,
    sequence: 0,
  };
}

export function updateEvent(prev: UCEvent, input: EventInput, now: Date = new Date()): UCEvent {
  const next = createEvent(input, prev.uid, now);
  return { ...next, created: prev.created, sequence: prev.sequence + 1 };
}

export function defaultCollection(now: Date = new Date()): Collection {
  return { id: DEFAULT_COLLECTION_ID, name: "", color: COLLECTION_COLORS[0], created: now.toISOString() };
}

export function emptyDocument(): EventStoreDocument {
  return { schemaVersion: SCHEMA_VERSION, collections: [defaultCollection()], events: [] };
}

/**
 * Structural check when loading persisted data, with migration:
 * v1 (no collections) → v2: every event goes into the default collection.
 */
export function parseDocument(raw: unknown): EventStoreDocument {
  const o = raw as { schemaVersion?: number; events?: UCEvent[]; collections?: Collection[] } | null;
  if (!o || !Array.isArray(o.events)) throw new Error("Unrecognised event store document");
  if (o.schemaVersion === 1) {
    return {
      schemaVersion: SCHEMA_VERSION,
      collections: [defaultCollection()],
      events: o.events.map((e) => ({ ...e, collectionId: DEFAULT_COLLECTION_ID })),
    };
  }
  if (o.schemaVersion !== SCHEMA_VERSION || !Array.isArray(o.collections) || o.collections.length === 0)
    throw new Error("Unrecognised event store document (expected schemaVersion 1 or 2)");
  return o as EventStoreDocument;
}

export interface CollectionInput { name: string; color: string }

export function validateCollectionInput(raw: unknown): ValidationResult<CollectionInput> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (name.length > 60) errors.push("name must be at most 60 characters");
  const color = typeof o.color === "string" ? o.color : "";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) errors.push("color must be #rrggbb");
  return errors.length ? { ok: false, errors } : { ok: true, value: { name, color } };
}

export const UID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
