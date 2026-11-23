import { buildIcs } from "@/core/export/ics";
import { checkFeedToken, errorResponse } from "@/server/http";
import { feedRange, icsResponse } from "@/server/feeds";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * The user's own events (never built-in holidays).
 *   /calendar.ics                  all calendars
 *   /calendar.ics?collection=<id>  one calendar
 *   &download=1                    as a file download
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await checkFeedToken(url))) return new Response("Forbidden", { status: 403 });
  try {
    const doc = await getStore().load();
    const id = url.searchParams.get("collection");
    const collection = id ? doc.collections.find((c) => c.id === id) : undefined;
    if (id && !collection) return new Response("Not found", { status: 404 });
    const base = process.env.UC_CALENDAR_NAME ?? "Ittim";
    const events = collection ? doc.events.filter((e) => e.collectionId === collection.id) : doc.events;
    const body = buildIcs(events, {
      range: feedRange(),
      calendarName: collection ? `${base} — ${collection.name || (collection.id === "personal" ? "Personal" : collection.id)}` : base,
      uidDomain: process.env.UC_UID_DOMAIN ?? "universal-calendar",
    });
    return icsResponse(body, collection ? `universal-calendar-${collection.id}.ics` : "universal-calendar.ics", url.searchParams.get("download") === "1");
  } catch (e) {
    return errorResponse(e);
  }
}
