import { buildHolidaysIcs } from "@/core/export/ics";
import { HOLIDAY_CATEGORIES, jewishHolidays, type HolidayCategory } from "@/core/holidays/registry";
import { checkHolidayFeedToken } from "@/server/http";
import { feedRange, icsResponse } from "@/server/feeds";

export const dynamic = "force-dynamic";

/**
 * Legacy: /holidays.ics?region=il|diaspora&categories=major,fast,...&lang=he|en.
 * Kept so existing subscriptions keep working; new links point to the computed calendar's own feed
 * (/calendar.ics?collection=<id>), which uses that calendar's saved settings. The UIDs are the same.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkHolidayFeedToken(url)) return new Response("Forbidden", { status: 403 });
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
