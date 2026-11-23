import { buildIcs } from "@/core/export/ics";
import { todayEpochDay } from "@/core/time/epochDay";
import { checkFeedToken, errorResponse } from "@/server/http";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export async function GET(req: Request) {
  if (!checkFeedToken(new URL(req.url))) return new Response("Forbidden", { status: 403 });
  try {
    const doc = await getStore().load();
    // Bounded rolling window on the absolute day axis (not on any calendar's months).
    const today = todayEpochDay(process.env.UC_TIMEZONE ?? "UTC");
    const range = {
      start: today - int(process.env.UC_FEED_PAST_DAYS, 365),
      end: today + int(process.env.UC_FEED_FUTURE_DAYS, 3 * 366),
    };
    const body = buildIcs(doc.events, {
      range,
      calendarName: process.env.UC_CALENDAR_NAME ?? "Universal Calendar",
      uidDomain: process.env.UC_UID_DOMAIN ?? "universal-calendar",
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="universal-calendar.ics"',
        "Cache-Control": "public, max-age=0, s-maxage=300",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
