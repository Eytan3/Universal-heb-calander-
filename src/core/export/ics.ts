/**
 * ICS (iCalendar, RFC 5545) output adapter.
 *
 * Apple Calendar and most clients do not implement RFC 7529 RSCALE, so the feed
 * contains *materialised occurrences* — one all-day VEVENT per occurrence inside
 * a bounded rolling window — encoded with conventional Gregorian DATE values.
 * The feed is derived output only; it is never read back as source of truth.
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

  for (const occ of expandAll(events, opts.range)) {
    const ev = byUid.get(occ.eventUid)!;
    const cal = getCalendar(ev.start.calendar);
    const nativeEn = cal.formatDate(occ.native, "en");
    const descParts = [
      `${cal.calendarName("en")} date: ${nativeEn}`,
      ev.start.calendar === "hebrew" ? `תאריך עברי: ${cal.formatDate(occ.native, "he")}` : null,
      `Rule: ${describeRule(ev, "en")}`,
      ev.description ?? null,
    ].filter(Boolean) as string[];

    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}.${occ.key}@${domain}`,
      `DTSTAMP:${icsUtc(ev.updated)}`,
      `LAST-MODIFIED:${icsUtc(ev.updated)}`,
      `CREATED:${icsUtc(ev.created)}`,
      `SEQUENCE:${ev.sequence}`,
      `DTSTART;VALUE=DATE:${icsDate(occ.epochDay)}`,
      `DTEND;VALUE=DATE:${icsDate(occ.epochDay + 1)}`,
      `SUMMARY:${escapeText(ev.title)}`,
      `DESCRIPTION:${escapeText(descParts.join("\n"))}`,
      "TRANSP:TRANSPARENT",
      `X-UNIVERSAL-CALENDAR-NATIVE-DATE:${occ.native.calendar}:${occ.native.year}-${occ.native.monthCode}-${String(occ.native.day).padStart(2, "0")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
