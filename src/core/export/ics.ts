/**
 * ICS (iCalendar, RFC 5545) output adapter.
 *
 * Apple Calendar and most clients do not implement RFC 7529 RSCALE, so the feed
 * contains *materialised occurrences* — one all-day VEVENT per occurrence inside
 * a bounded rolling window — encoded with conventional Gregorian DATE values.
 * The feed is derived output only; it is never read back as source of truth.
 *
 * Daily and weekly rules are calendar-independent and are exported as a plain RRULE instead.
 *
 * Stability: each VEVENT UID is `<event uid>.<calendar>-<native year>@<domain>`,
 * so an occurrence keeps its UID across feed refreshes and across edits to the
 * event (an edit moves the occurrence instead of duplicating it).
 */
import { getCalendar, gregorian } from "../calendars/registry";
import type { EpochDay } from "../time/epochDay";
import { holidayInfo, holidayText } from "../holidays/info";
import { describeRule } from "../events/describe";
import { expandAll, type Range } from "../events/expand";
import { isComputed, type EventStoreDocument, type UCEvent } from "../events/schema";
import { computedOccurrences } from "../holidays/computed";
import { icsUtcDateTime, zonedToUtc } from "../time/zoned";

export interface IcsOptions {
  range: Range;
  calendarName?: string;
  uidDomain?: string;
  /** Suggested client refresh interval, ISO-8601 duration. */
  refreshInterval?: string;
}

const CRLF = "\r\n";

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets (RFC 5545 §3.1) without splitting UTF-8 sequences. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (currentBytes + b > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += ch;
    currentBytes += b;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

export function icsDate(day: EpochDay): string {
  const g = gregorian.fromEpochDay(day);
  return `${String(g.year).padStart(4, "0")}${g.monthCode.slice(1)}${String(g.day).padStart(2, "0")}`;
}

function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

type Timing = { startTime: string; durationMinutes: number; timeZone: string };

/** All-day → DATE values; timed → exact UTC instants for that day's wall-clock time in the event's zone. */
function veventHead(ev: UCEvent, uid: string, day: EpochDay, timing?: Timing): string[] {
  const when = timing
    ? (() => {
        const start = zonedToUtc(day, timing.startTime, timing.timeZone);
        return [`DTSTART:${icsUtcDateTime(start)}`, `DTEND:${icsUtcDateTime(start + timing.durationMinutes * 60000)}`];
      })()
    : [`DTSTART;VALUE=DATE:${icsDate(day)}`, `DTEND;VALUE=DATE:${icsDate(day + 1)}`];
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(ev.updated)}`,
    `LAST-MODIFIED:${icsUtc(ev.updated)}`,
    `CREATED:${icsUtc(ev.created)}`,
    `SEQUENCE:${ev.sequence}`,
    ...when,
    `SUMMARY:${escapeText(ev.title)}`,
    // An all-day reminder does not make you busy; a timed appointment does (as in Apple Calendar).
    timing ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT",
  ];
}

const timingOf = (ev: UCEvent, occ?: { startTime?: string; durationMinutes?: number }): Timing | undefined =>
  ev.showWithoutTime === false && ev.startTime && ev.timeZone
    ? { startTime: occ?.startTime ?? ev.startTime, durationMinutes: occ?.durationMinutes ?? ev.durationMinutes ?? 60, timeZone: ev.timeZone }
    : undefined;

function calendarHead(name: string, refresh: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ittim//Ittim 0.1//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(name)}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];
}

const finish = (lines: string[]) => [...lines, "END:VCALENDAR"].map(foldLine).join(CRLF) + CRLF;

export function buildIcs(events: UCEvent[], opts: IcsOptions): string {
  return finish([...calendarHead(opts.calendarName ?? "Ittim", opts.refreshInterval ?? "PT6H"), ...eventLines(events, opts)]);
}

/** The VEVENTs for the user's own events (no calendar wrapper). */
export function eventLines(events: UCEvent[], opts: Pick<IcsOptions, "range" | "uidDomain">): string[] {
  const domain = opts.uidDomain ?? "universal-calendar";
  const byUid = new Map(events.map((e) => [e.uid, e]));
  const lines: string[] = [];

  // All-day daily/weekly series go out as a plain RRULE. Timed ones are materialised like the rest: each
  // occurrence gets its own exact UTC time, so a 10:00 meeting stays at 10:00 local across DST changes
  // without any VTIMEZONE (which clients handle inconsistently).
  const isFixedStep = (e: UCEvent) => {
    const f = e.recurrenceRules?.[0]?.frequency;
    return (f === "daily" || f === "weekly") && e.showWithoutTime !== false;
  };

  // Daily / weekly rules are the same in every calendar, so they are exported as a standard
  // RRULE that every client understands — one VEVENT per event, no materialisation needed.
  for (const ev of events.filter(isFixedStep)) {
    const cal = getCalendar(ev.start.calendar);
    const rule = ev.recurrenceRules![0];
    const original = cal.toEpochDay(ev.start);
    const step = (rule.interval ?? 1) * (rule.frequency === "weekly" ? 7 : 1);
    // With `from`, the repeating series starts at the first step on/after it; the original stays as its own event.
    const fromDay = rule.from ? cal.toEpochDay(rule.from) : original;
    const first = original + Math.ceil((fromDay - original) / step) * step;
    const desc = `DESCRIPTION:${escapeText([`Rule: ${describeRule(ev, "en")}`, ev.description].filter(Boolean).join("\n"))}`;
    if (first !== original) lines.push(...veventHead(ev, `${ev.uid}.origin@${domain}`, original), desc, "END:VEVENT");
    // Per-occurrence changes: deleted ones become EXDATE; changed/moved ones are separate
    // instances of the same UID with RECURRENCE-ID (RFC 5545 §3.8.4.4).
    const overrides = Object.entries(ev.recurrenceOverrides ?? {}).filter(([id]) => Number(id) >= first);
    const exdates = overrides.filter(([, o]) => o.excluded).map(([id]) => icsDate(Number(id)));
    const seriesUid = `${ev.uid}.rule@${domain}`;
    lines.push(
      ...veventHead(ev, seriesUid, first),
      `RRULE:FREQ=${rule.frequency.toUpperCase()};INTERVAL=${rule.interval ?? 1}${rule.until ? `;UNTIL=${icsDate(cal.toEpochDay(rule.until))}` : ""}`,
      ...(exdates.length ? [`EXDATE;VALUE=DATE:${exdates.join(",")}`] : []),
      desc,
      "END:VEVENT",
    );
    for (const [id, o] of overrides) {
      if (o.excluded) continue;
      const day = o.start ? getCalendar(o.start.calendar).toEpochDay(o.start) : Number(id);
      const head = veventHead({ ...ev, title: o.title ?? ev.title }, seriesUid, day);
      lines.push(
        ...head.slice(0, 2), `RECURRENCE-ID;VALUE=DATE:${icsDate(Number(id))}`, ...head.slice(2),
        `DESCRIPTION:${escapeText([`Rule: ${describeRule(ev, "en")}`, o.description ?? ev.description].filter(Boolean).join("\n"))}`,
        "END:VEVENT",
      );
    }
  }

  // Monthly / yearly / one-time: materialised occurrences, because their meaning depends on
  // the event's own calendar (e.g. Hebrew months), which clients cannot compute.
  for (const occ of expandAll(events.filter((e) => !isFixedStep(e)), opts.range)) {
    const ev = byUid.get(occ.eventUid)!;
    const cal = getCalendar(ev.start.calendar);
    const nativeEn = cal.formatDate(occ.native, "en");
    const timing = timingOf(ev, occ);
    const descParts = [
      `${cal.calendarName("en")} date: ${nativeEn}`,
      timing ? `Time: ${timing.startTime} (${timing.timeZone})` : null,
      ev.start.calendar === "hebrew" ? `תאריך עברי: ${cal.formatDate(occ.native, "he")}` : null,
      `Rule: ${describeRule(ev, "en")}`,
      occ.description ?? ev.description ?? null,
    ].filter(Boolean) as string[];

    lines.push(
      ...veventHead({ ...ev, title: occ.title ?? ev.title }, `${ev.uid}.${occ.key}@${domain}`, occ.epochDay, timing),
      `DESCRIPTION:${escapeText(descParts.join("\n"))}`,
      `X-UNIVERSAL-CALENDAR-NATIVE-DATE:${occ.native.calendar}:${occ.native.year}-${occ.native.monthCode}-${String(occ.native.day).padStart(2, "0")}`,
      "END:VEVENT",
    );
  }
  return lines;
}

type HolidayLike = { id: string; epochDay: EpochDay; en: string; he: string; at?: number };

/** ICS for a set of computed holidays on its own. */
export function buildHolidaysIcs(
  occurrences: HolidayLike[],
  opts: { calendarName: string; uidDomain?: string; locale: "en" | "he"; refreshInterval?: string },
): string {
  return finish([...calendarHead(opts.calendarName, opts.refreshInterval ?? "P1D"), ...holidayLines(occurrences, opts)]);
}

/** The VEVENTs for computed holidays (no calendar wrapper). */
export function holidayLines(occurrences: HolidayLike[], opts: { uidDomain?: string; locale: "en" | "he" }): string[] {
  const domain = opts.uidDomain ?? "universal-calendar";
  const lines: string[] = [];
  for (const o of occurrences) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable: the same holiday on the same day always has the same UID.
      `UID:holiday.${o.id}.${icsDate(o.epochDay)}@${domain}`,
      "DTSTAMP:20260101T000000Z",
      // Candle lighting / havdalah are moments (exact UTC); holidays are whole days.
      ...(o.at !== undefined
        ? [`DTSTART:${icsUtcDateTime(o.at)}`, `DTEND:${icsUtcDateTime(o.at)}`]
        : [`DTSTART;VALUE=DATE:${icsDate(o.epochDay)}`, `DTEND;VALUE=DATE:${icsDate(o.epochDay + 1)}`]),
      `SUMMARY:${escapeText(`${holidayInfo(o.id)?.emoji ? `${holidayInfo(o.id)!.emoji} ` : ""}${opts.locale === "he" ? o.he : o.en}`)}`,
      `DESCRIPTION:${escapeText([holidayText(o.id, opts.locale), opts.locale === "he" ? o.en : o.he].filter(Boolean).join("\n"))}`,
      "TRANSP:TRANSPARENT",
      "CATEGORIES:Holiday",
      "END:VEVENT",
    );
  }
  return lines;
}

/**
 * One ICS for any mix of calendars — regular ones (their stored events) and computed ones (their entries
 * generated from each calendar's own settings). Used by the feeds and by Export alike.
 */
export function buildCollectionsIcs(
  doc: EventStoreDocument,
  collectionIds: string[] | null,
  opts: { range: Range; calendarName: string; uidDomain?: string; locale: "en" | "he"; refreshInterval?: string },
): string {
  const chosen = collectionIds ? doc.collections.filter((c) => collectionIds.includes(c.id)) : doc.collections;
  const ids = new Set(chosen.filter((c) => !isComputed(c)).map((c) => c.id));
  const lines = [...calendarHead(opts.calendarName, opts.refreshInterval ?? "PT6H"), ...eventLines(doc.events.filter((e) => ids.has(e.collectionId)), opts)];
  // Several computed calendars may produce the same holiday on the same day; it is listed once.
  const seen = new Set<string>();
  for (const c of chosen.filter(isComputed)) {
    const occ = computedOccurrences(c, opts.range).filter((o) => {
      const k = `${o.id}.${o.epochDay}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    lines.push(...holidayLines(occ, opts));
  }
  return finish(lines);
}
