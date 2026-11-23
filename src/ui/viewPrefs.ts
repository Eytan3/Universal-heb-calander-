/**
 * Per-browser display preferences: which calendars are shown and how holidays appear.
 * Hiding never deletes anything; it only filters what this browser displays.
 */
import type { HolidayCategory } from "@/core/holidays/types";

export interface HolidayPrefs {
  enabled: boolean;
  region: "il" | "diaspora";
  categories: HolidayCategory[];
}

export interface ViewPrefs {
  hiddenCollections: string[];
  holidays: HolidayPrefs;
}

const KEY = "universal-calendar:view";

export const DEFAULT_VIEW: ViewPrefs = {
  hiddenCollections: [],
  holidays: { enabled: true, region: "il", categories: ["major", "minor", "fast", "modern"] },
};

export function readViewPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VIEW;
    const v = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      hiddenCollections: Array.isArray(v.hiddenCollections) ? v.hiddenCollections : [],
      holidays: { ...DEFAULT_VIEW.holidays, ...(v.holidays ?? {}) },
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveViewPrefs(v: ViewPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
