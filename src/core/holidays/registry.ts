import { jewishHolidays } from "./jewish";
import type { HolidaySet } from "./types";

/** Built-in holiday sets. Future sets (e.g. Islamic, Christian, national) register here. */
export const HOLIDAY_SETS: HolidaySet[] = [jewishHolidays];

export { jewishHolidays };
export * from "./types";
