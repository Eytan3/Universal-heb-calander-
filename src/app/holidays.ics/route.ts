import { buildHolidaysIcs } from "@/core/export/ics";
import { HOLIDAY_CATEGORIES, jewishHolidays, type HolidayCategory } from "@/core/holidays/registry";
import { checkFeedToken } from "@/server/http";
import { feedRange, icsResponse } from "@/server/feeds";

export const dynamic = "force-dynamic";

/** /holidays.ics?region=il|diaspora&categories=major,fast,...&lang=he|en — computed from built-in rules. */
export function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkFeedToken(url)) return new Response("Forbidden", { status: 403 });
  const region = url.searchParams.get("region") === "diaspora" ? "diaspora" : "il";
  const requested = (url.searchParams.get("categories") ?? "").split(",").filter(Boolean);
  const categories = requested.length
    ? HOLIDAY_CATEGORIES.filter((c) => requested.includes(c))
    : (["major", "minor", "fast", "modern"] as HolidayCategory[]);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "he";
  const occ = jewishHolidays.occurrences(feedRange(), { region, categories });
  const body = buildHolidaysIcs(occ, { calendarName: locale === "he" ? "חגים ומועדים" : "Jewish holidays", locale });
  return icsResponse(body, "holidays.ics", url.searchParams.get("download") === "1");
}
