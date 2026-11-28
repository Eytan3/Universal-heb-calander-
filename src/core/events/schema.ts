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

import { HOLIDAY_CATEGORIES, type HolidayCategory } from "../holidays/types";
import { HHMM_PATTERN, isValidTimeZone } from "../time/zoned";

export const SCHEMA_VERSION = 3 as const;

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
  /**
   * "events" (default): holds the user's own events.
   * "jewish": a computed calendar — no stored events; its entries (holidays, fasts, …) are generated
   * from rules, configured by `jewish`. It behaves like any calendar: colour, show/hide, feed, export, delete.
   */
  kind?: CollectionKind;
  jewish?: JewishCalendarSettings;
}

export type CollectionKind = "events" | "jewish";

/** Settings of a computed Jewish calendar (like Hebcal's options). */
export interface JewishCalendarSettings {
  /** Israel or diaspora observance (second festival days, Simchat Torah, …). */
  region: "il" | "diaspora";
  /** Which kinds of days to include. */
  categories: HolidayCategory[];
}

export const DEFAULT_JEWISH_SETTINGS: JewishCalendarSettings = { region: "il", categories: ["major", "minor", "fast", "modern"] };
export const JEWISH_COLLECTION_ID = "jewish";
export const JEWISH_COLOR = "#5e35b1";

export const isComputed = (c: Collection | undefined) => c?.kind === "jewish";

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

/**
 * A change to a single occurrence of a recurring event (JSCalendar "recurrenceOverrides").
 * `excluded` deletes that occurrence; otherwise any of title / description / start replace the
 * series values for that occurrence only (a new `start` moves it to another day).
 */
export interface OccurrenceOverride {
  excluded?: true;
  title?: string;
  description?: string;
  start?: CalendarDate;
  /** Timed events: a different time for this occurrence only. */
  startTime?: string;
  durationMinutes?: number;
}

export interface UCEvent {
  "@type": "Event";
  uid: string;
  title: string;
  description?: string;
  /** JSCalendar's all-day flag: true = all day (the default); false = at a time of day. */
  showWithoutTime: boolean;
  start: CalendarDate;
  /** Timed events only: wall-clock start "HH:MM" in `timeZone`, kept on every occurrence (DST-safe). */
  startTime?: string;
  /** Timed events only: length in minutes (0 … 7 days). */
  durationMinutes?: number;
  /** Timed events only: IANA time zone the times are in, e.g. "Asia/Jerusalem". */
  timeZone?: string;
  recurrenceRules?: RecurrenceRule[];
  /** The user calendar (collection) this event belongs to. */
  collectionId: string;
  /**
   * Per-occurrence changes, keyed by the occurrence's *recurrence id*: the EpochDay on which the
   * series itself places it (JSCalendar keys by LocalDateTime; an absolute day keeps the key
   * calendar-neutral). Ids that the rule no longer produces are ignored.
   */
  recurrenceOverrides?: Record<string, OccurrenceOverride>;
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
  /** Default true (all day). When false, startTime / durationMinutes / timeZone are required. */
  showWithoutTime?: boolean;
  startTime?: string;
  durationMinutes?: number;
  timeZone?: string;
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

  // Time of day (Apple's "All-day" switch): absent / true = all day.
  let timed: { startTime: string; durationMinutes: number; timeZone: string } | undefined;
  if (o.showWithoutTime === false) {
    const startTime = typeof o.startTime === "string" ? o.startTime : "";
    if (!HHMM_PATTERN.test(startTime)) errors.push("startTime must be HH:MM (00:00–23:59)");
    const durationMinutes = o.durationMinutes === undefined ? 60 : Number(o.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 7 * 1440) errors.push("durationMinutes must be 0–10080");
    if (!isValidTimeZone(o.timeZone)) errors.push("timeZone must be an IANA time zone, e.g. Asia/Jerusalem");
    if (HHMM_PATTERN.test(startTime) && isValidTimeZone(o.timeZone)) timed = { startTime, durationMinutes, timeZone: o.timeZone };
  } else if (o.showWithoutTime !== undefined && o.showWithoutTime !== true) {
    errors.push("showWithoutTime must be true or false");
  }

  let collectionId: string | undefined;
  if (o.collectionId !== undefined && o.collectionId !== null && o.collectionId !== "") {
    if (typeof o.collectionId !== "string" || !UID_PATTERN.test(o.collectionId)) errors.push("collectionId is invalid");
    else collectionId = o.collectionId;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title, description, start: start!, recurrenceRules,
      ...(timed ? { showWithoutTime: false, ...timed } : {}),
      ...(collectionId ? { collectionId } : {}),
    },
  };
}

export function createEvent(input: EventInput, uid: string, now: Date = new Date()): UCEvent {
  const ts = now.toISOString();
  return {
    "@type": "Event",
    uid,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    showWithoutTime: input.showWithoutTime === false ? false : true,
    start: { ...input.start },
    ...(input.showWithoutTime === false
      ? { startTime: input.startTime, durationMinutes: input.durationMinutes ?? 60, timeZone: input.timeZone }
      : {}),
    ...(input.recurrenceRules?.length ? { recurrenceRules: input.recurrenceRules } : {}),
    collectionId: input.collectionId ?? DEFAULT_COLLECTION_ID,
    created: ts,
    updated: ts,
    sequence: 0,
  };
}

export function updateEvent(prev: UCEvent, input: EventInput, now: Date = new Date()): UCEvent {
  const next = createEvent(input, prev.uid, now);
  // Occurrence-level changes survive a series edit (ids the new rule no longer produces are ignored).
  const keep = next.recurrenceRules?.length && prev.recurrenceOverrides && Object.keys(prev.recurrenceOverrides).length;
  return { ...next, ...(keep ? { recurrenceOverrides: prev.recurrenceOverrides } : {}), created: prev.created, sequence: prev.sequence + 1 };
}

/** Cap on per-occurrence changes stored on one event. */
export const MAX_OVERRIDES = 2000;

export function defaultCollection(now: Date = new Date()): Collection {
  return { id: DEFAULT_COLLECTION_ID, name: "", color: COLLECTION_COLORS[0], created: now.toISOString() };
}

/** The computed Jewish calendar every new document starts with (it can be deleted for a clean calendar). */
export function jewishCollection(now: Date = new Date(), settings: JewishCalendarSettings = DEFAULT_JEWISH_SETTINGS): Collection {
  return { id: JEWISH_COLLECTION_ID, name: "", color: JEWISH_COLOR, created: now.toISOString(), kind: "jewish", jewish: { ...settings, categories: [...settings.categories] } };
}

export function emptyDocument(): EventStoreDocument {
  return { schemaVersion: SCHEMA_VERSION, collections: [defaultCollection(), jewishCollection()], events: [] };
}

/**
 * Structural check when loading persisted data, with migration:
 * v1 (no collections) → v2: every event goes into the default collection.
 * v2 → v3: the built-in holidays become a computed calendar in the list (holiday display settings that
 *          used to live in each browser are carried over by the UI once, see viewPrefs).
 */
export function parseDocument(raw: unknown): EventStoreDocument {
  const o = raw as { schemaVersion?: number; events?: UCEvent[]; collections?: Collection[] } | null;
  if (!o || !Array.isArray(o.events)) throw new Error("Unrecognised event store document");
  if (o.schemaVersion === 1) {
    return {
      schemaVersion: SCHEMA_VERSION,
      collections: [defaultCollection(), jewishCollection()],
      events: o.events.map((e) => ({ ...e, collectionId: DEFAULT_COLLECTION_ID })),
    };
  }
  if (o.schemaVersion === 2 && Array.isArray(o.collections) && o.collections.length > 0) {
    return { schemaVersion: SCHEMA_VERSION, collections: [...o.collections, jewishCollection()], events: o.events };
  }
  if (o.schemaVersion !== SCHEMA_VERSION || !Array.isArray(o.collections) || o.collections.length === 0)
    throw new Error("Unrecognised event store document (expected schemaVersion 1, 2 or 3)");
  return o as EventStoreDocument;
}

export interface CollectionInput {
  name: string;
  color: string;
  /** Only when creating; a calendar's kind never changes. Default "events". */
  kind?: CollectionKind;
  /** For computed Jewish calendars. */
  jewish?: JewishCalendarSettings;
}

export function validateJewishSettings(raw: unknown): ValidationResult<JewishCalendarSettings> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const region = o.region === "il" || o.region === "diaspora" ? o.region : null;
  if (!region) errors.push("region must be il or diaspora");
  const cats = Array.isArray(o.categories) ? o.categories : null;
  if (!cats || cats.some((c) => !HOLIDAY_CATEGORIES.includes(c as HolidayCategory))) errors.push(`categories must be a subset of ${HOLIDAY_CATEGORIES.join(", ")}`);
  if (errors.length) return { ok: false, errors };
  // Keep the canonical order, without duplicates.
  return { ok: true, value: { region: region!, categories: HOLIDAY_CATEGORIES.filter((c) => cats!.includes(c)) } };
}

export function validateCollectionInput(raw: unknown): ValidationResult<CollectionInput> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (name.length > 60) errors.push("name must be at most 60 characters");
  const color = typeof o.color === "string" ? o.color : "";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) errors.push("color must be #rrggbb");
  const kind = o.kind === undefined ? undefined : o.kind === "events" || o.kind === "jewish" ? o.kind : null;
  if (kind === null) errors.push("kind must be events or jewish");
  let jewish: JewishCalendarSettings | undefined;
  if (o.jewish !== undefined) {
    const v = validateJewishSettings(o.jewish);
    if (v.ok) jewish = v.value; else errors.push(...v.errors.map((e) => `jewish.${e}`));
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, color, ...(kind ? { kind } : {}), ...(jewish ? { jewish } : {}) } };
}

export const UID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
