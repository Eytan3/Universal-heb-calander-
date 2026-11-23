import { describe, expect, it } from "vitest";
import { hebrew } from "@/core/calendars/registry";
import { HOLIDAY_CATEGORIES, jewishHolidays } from "@/core/holidays/registry";
import { holidayInfo, holidayLink } from "@/core/holidays/info";
import { buildHolidaysIcs } from "@/core/export/ics";

describe("holiday explanations and icons", () => {
  const range = { start: hebrew.toEpochDay({ year: 5784, monthCode: "M01", day: 1 }), end: hebrew.toEpochDay({ year: 5788, monthCode: "M01", day: 1 }) };
  const all = [...jewishHolidays.occurrences(range, { region: "il", categories: HOLIDAY_CATEGORIES }),
    ...jewishHolidays.occurrences(range, { region: "diaspora", categories: HOLIDAY_CATEGORIES })];
  it("every holiday has an icon and an explanation in Hebrew and English", () => {
    const missing = [...new Set(all.map((o) => o.id))].filter((id) => { const i = holidayInfo(id); return !i || !i.emoji || !i.he || !i.en; });
    expect(missing).toEqual([]);
  });
  it("has a read-more link", () => {
    expect(holidayLink("pesach-1", "he")).toMatch(/^https:\/\/he\.wikipedia\.org\/w\/index\.php\?search=/);
  });
  it("the holidays feed carries the icon and the explanation", () => {
    const ics = buildHolidaysIcs(all.filter((o) => o.id === "chanukah-1").slice(0, 1), { calendarName: "x", locale: "he" });
    expect(ics).toContain("SUMMARY:🕎 חנוכה");
    expect(ics).toMatch(/DESCRIPTION:.*כ״ה בכסלו/);
  });
});
