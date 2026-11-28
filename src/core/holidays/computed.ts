/**
 * Entries of a computed calendar: generated from the calendar's own settings, never stored.
 */
import { DEFAULT_JEWISH_SETTINGS, type Collection } from "../events/schema";
import type { Range } from "../events/expand";
import { jewishHolidays } from "./jewish";
import type { HolidayOccurrence } from "./types";

export function computedOccurrences(c: Collection, range: Range): HolidayOccurrence[] {
  if (c.kind !== "jewish") return [];
  const s = c.jewish ?? DEFAULT_JEWISH_SETTINGS;
  return jewishHolidays.occurrences(range, { region: s.region, categories: s.categories });
}
