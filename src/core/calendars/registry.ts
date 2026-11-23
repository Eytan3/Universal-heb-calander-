import { gregorian } from "./gregorian";
import { hebrew } from "./hebrew";
import type { CalendarAdapter, CalendarId } from "./types";

/** The single place new calendars (islamic-umalqura, chinese, persian, …) are registered. */
const ADAPTERS: Record<CalendarId, CalendarAdapter> = { gregory: gregorian, hebrew };

export const CALENDAR_IDS = Object.keys(ADAPTERS) as CalendarId[];

export function isCalendarId(x: unknown): x is CalendarId {
  return typeof x === "string" && x in ADAPTERS;
}

export function getCalendar(id: CalendarId): CalendarAdapter {
  const a = ADAPTERS[id];
  if (!a) throw new RangeError(`Unsupported calendar: ${id}`);
  return a;
}

export { gregorian, hebrew };
export type * from "./types";
