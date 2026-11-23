/**
 * Built-in holiday sets: read-only, rule-based calendars layered over the views.
 * They are computed on demand like any other occurrence — never stored — and can be
 * switched off entirely for a clean calendar.
 */
import type { CalendarId } from "../calendars/types";
import type { EpochDay } from "../time/epochDay";
import type { Range } from "../events/expand";

export type HolidayCategory = "major" | "minor" | "fast" | "modern" | "roshchodesh";
export const HOLIDAY_CATEGORIES: HolidayCategory[] = ["major", "minor", "fast", "modern", "roshchodesh"];

export interface HolidayOptions {
  /** Israel or diaspora observance (second festival days, Simchat Torah, …). */
  region: "il" | "diaspora";
  /** Categories to include; empty = none. */
  categories: HolidayCategory[];
}

export interface HolidayOccurrence {
  /** Stable id of the holiday rule, e.g. "pesach-1". */
  id: string;
  epochDay: EpochDay;
  en: string;
  he: string;
  category: HolidayCategory;
  yomTov: boolean;
  /** Which holiday set produced it. */
  set: string;
}

export interface HolidaySet {
  id: string;
  name: { en: string; he: string };
  /** The calendar its rules are defined in. */
  calendar: CalendarId;
  occurrences(range: Range, options: HolidayOptions): HolidayOccurrence[];
}
