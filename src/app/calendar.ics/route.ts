import { buildCollectionsIcs } from "@/core/export/ics";
import { DEFAULT_COLLECTION_ID } from "@/core/events/schema";
import { checkFeedToken, errorResponse } from "@/server/http";
import { feedRange, icsResponse } from "@/server/feeds";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Calendar feed — any selection of calendars, regular and computed (holidays …) alike.
 *   /calendar.ics                       all calendars
 *   /calendar.ics?collection=<id>       one calendar
 *   /calendar.ics?collections=<id>,<id> a chosen set
 *   &lang=he|en                         language of computed entries (default he)
 *   &download=1                         as a file download
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await checkFeedToken(url))) return new Response("Forbidden", { status: 403 });
  try {
    const doc = await getStore().load();
    const one = url.searchParams.get("collection");
    const many = url.searchParams.get("collections");
    const ids = one ? [one] : many ? many.split(",").map((s) => s.trim()).filter(Boolean) : null;
    if (ids && (ids.length === 0 || ids.some((id) => !doc.collections.some((c) => c.id === id)))) return new Response("Not found", { status: 404 });
    const base = process.env.UC_CALENDAR_NAME ?? "Ittim";
    const locale = url.searchParams.get("lang") === "en" ? "en" : "he";
    const single = ids?.length === 1 ? doc.collections.find((c) => c.id === ids[0])! : undefined;
    const singleName = single
      ? single.name || (single.kind === "jewish" ? (locale === "he" ? "חגים ומועדים" : "Jewish holidays") : single.id === DEFAULT_COLLECTION_ID ? (locale === "he" ? "אישי" : "Personal") : single.id)
      : "";
    const body = buildCollectionsIcs(doc, ids, {
      range: feedRange(),
      calendarName: single ? `${base} — ${singleName}` : base,
      uidDomain: process.env.UC_UID_DOMAIN ?? "universal-calendar",
      locale,
    });
    const file = single ? `universal-calendar-${single.id}.ics` : "universal-calendar.ics";
    return icsResponse(body, file, url.searchParams.get("download") === "1");
  } catch (e) {
    return errorResponse(e);
  }
}
