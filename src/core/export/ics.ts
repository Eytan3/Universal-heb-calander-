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
import { describeRule } from "../events/describe";
import { expandAll, type Range } from "../events/expand";
import type { UCEvent } from "../events/schema";

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

function veventHead(ev: UCEvent, uid: string, day: EpochDay): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(ev.updated)}`,
    `LAST-MODIFIED:${icsUtc(ev.updated)}`,
    `CREATED:${icsUtc(ev.created)}`,
    `SEQUENCE:${ev.sequence}`,
    `DTSTART;VALUE=DATE:${icsDate(day)}`,
    `DTEND;VALUE=DATE:${icsDate(day + 1)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    "TRANSP:TRANSPARENT",
  ];
}

export function buildIcs(events: UCEvent[], opts: IcsOptions): string {
  const domain = opts.uidDomain ?? "universal-calendar";
  const name = opts.calendarName ?? "Universal Calendar";
  const refresh = opts.refreshInterval ?? "PT6H";
  const byUid = new Map(events.map((e) => [e.uid, e]));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Universal Calendar//Universal Calendar 0.1//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(name)}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  const isFixedStep = (e: UCEvent) => {
    const f = e.recurrenceRules?.[0]?.frequency;
    return f === "daily" || f === "weekly";
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
    const descParts = [
      `${cal.calendarName("en")} date: ${nativeEn}`,
      ev.start.calendar === "hebrew" ? `תאריך עברי: ${cal.formatDate(occ.native, "he")}` : null,
      `Rule: ${describeRule(ev, "en")}`,
      occ.description ?? ev.description ?? null,
    ].filter(Boolean) as string[];

    lines.push(
      ...veventHead({ ...ev, title: occ.title ?? ev.title }, `${ev.uid}.${occ.key}@${domain}`, occ.epochDay),
      `DESCRIPTION:${escapeText(descParts.join("\n"))}`,
      `X-UNIVERSAL-CALENDAR-NATIVE-DATE:${occ.native.calendar}:${occ.native.year}-${occ.native.monthCode}-${String(occ.native.day).padStart(2, "0")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** ICS for a built-in holiday set (separate feed, so the main feeds stay clean). */
export function buildHolidaysIcs(
  occurrences: { id: string; epochDay: EpochDay; en: string; he: string }[],
  opts: { calendarName: string; uidDomain?: string; locale: "en" | "he"; refreshInterval?: string },
): string {
  const domain = opts.uidDomain ?? "universal-calendar";
  const refresh = opts.refreshInterval ?? "P1D";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Universal Calendar//Universal Calendar 0.1//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `NAME:${escapeText(opts.calendarName)}`, `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`, `X-PUBLISHED-TTL:${refresh}`,
  ];
  for (const o of occurrences) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable: the same holiday on the same day always has the same UID.
      `UID:holiday.${o.id}.${icsDate(o.epochDay)}@${domain}`,
      "DTSTAMP:20260101T000000Z",
      `DTSTART;VALUE=DATE:${icsDate(o.epochDay)}`,
      `DTEND;VALUE=DATE:${icsDate(o.epochDay + 1)}`,
      `SUMMARY:${escapeText(opts.locale === "he" ? o.he : o.en)}`,
      `DESCRIPTION:${escapeText(opts.locale === "he" ? o.en : o.he)}`,
      "TRANSP:TRANSPARENT",
      "CATEGORIES:Holiday",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
