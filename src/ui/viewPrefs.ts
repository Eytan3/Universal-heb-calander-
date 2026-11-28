/**
 * Per-browser display preferences: which calendars are shown. Hiding never deletes anything.
 * (Holiday settings used to live here; they now belong to the computed calendar itself, so they
 * are the same on every device and in its feed. Old values are read once to migrate them.)
 */
import type { HolidayCategory } from "@/core/holidays/types";

export interface LegacyHolidayPrefs {
  enabled: boolean;
  region: "il" | "diaspora";
  categories: HolidayCategory[];
}

export interface ViewPrefs {
  hiddenCollections: string[];
}

const KEY = "universal-calendar:view";

export const DEFAULT_VIEW: ViewPrefs = { hiddenCollections: [] };

export function readViewPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VIEW;
    const v = JSON.parse(raw) as Partial<ViewPrefs>;
    return { hiddenCollections: Array.isArray(v.hiddenCollections) ? v.hiddenCollections : [] };
  } catch {
    return DEFAULT_VIEW;
  }
}

/** The holiday settings this browser had before they moved into the computed calendar (or null). */
export function readLegacyHolidayPrefs(): LegacyHolidayPrefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    const h = raw ? (JSON.parse(raw) as { holidays?: Partial<LegacyHolidayPrefs> }).holidays : undefined;
    if (!h) return null;
    return {
      enabled: h.enabled !== false,
      region: h.region === "diaspora" ? "diaspora" : "il",
      categories: Array.isArray(h.categories) ? h.categories : ["major", "minor", "fast", "modern"],
    };
  } catch {
    return null;
  }
}

export function saveViewPrefs(v: ViewPrefs) {
  // Writing without "holidays" also marks the legacy settings as migrated.
  try { localStorage.setItem(KEY, JSON.stringify({ hiddenCollections: v.hiddenCollections })); } catch { /* ignore */ }
}
