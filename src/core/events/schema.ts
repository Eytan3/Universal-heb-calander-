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

export const SCHEMA_VERSION = 1 as const;

export interface RecurrenceRule {
  "@type": "RecurrenceRule";
  frequency: "yearly";
  /** Calendar in which the rule is evaluated. MUST equal start.calendar in v1. */
  rscale: CalendarId;
  /** Every N years (default 1). */
  interval?: number;
  /** RFC 7529 SKIP for dates missing in a year. Default "omit" (RFC 7529 default). */
  skip?: SkipPolicy;
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
  /** RFC 3339 UTC instants. */
  created: string;
  updated: string;
  /** Incremented on every change; exported as iCalendar SEQUENCE. */
  sequence: number;
}

export interface EventStoreDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  events: UCEvent[];
}

/** Fields a client may set. Server-managed fields (uid, created, updated, sequence) are excluded. */
export interface EventInput {
  title: string;
  description?: string;
  start: CalendarDate;
  recurrenceRules?: RecurrenceRule[];
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
      if (r.frequency !== "yearly") errors.push("recurrence frequency must be 'yearly'");
      if (start && r.rscale !== undefined && r.rscale !== start.calendar)
        errors.push("recurrence rscale must equal start.calendar");
      const interval = r.interval === undefined ? 1 : Number(r.interval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 100) errors.push("interval must be 1–100");
      const skip = (r.skip ?? "omit") as SkipPolicy;
      if (!SKIPS.includes(skip)) errors.push("skip must be omit, backward or forward");
      if (start && errors.length === 0)
        recurrenceRules = [{ "@type": "RecurrenceRule", frequency: "yearly", rscale: start.calendar, interval, skip }];
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { title, description, start: start!, recurrenceRules } };
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
    created: ts,
    updated: ts,
    sequence: 0,
  };
}

export function updateEvent(prev: UCEvent, input: EventInput, now: Date = new Date()): UCEvent {
  const next = createEvent(input, prev.uid, now);
  return { ...next, created: prev.created, sequence: prev.sequence + 1 };
}

export function emptyDocument(): EventStoreDocument {
  return { schemaVersion: SCHEMA_VERSION, events: [] };
}

/** Light structural check when loading persisted data. */
export function parseDocument(raw: unknown): EventStoreDocument {
  const o = raw as Partial<EventStoreDocument> | null;
  if (!o || o.schemaVersion !== SCHEMA_VERSION || !Array.isArray(o.events))
    throw new Error("Unrecognised event store document (expected schemaVersion 1)");
  return o as EventStoreDocument;
}

export const UID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
