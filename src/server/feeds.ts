import { todayEpochDay } from "@/core/time/epochDay";

const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

/** Bounded rolling window on the absolute day axis, shared by all feeds. */
export function feedRange() {
  const today = todayEpochDay(process.env.UC_TIMEZONE ?? "UTC");
  return {
    start: today - int(process.env.UC_FEED_PAST_DAYS, 365),
    end: today + int(process.env.UC_FEED_FUTURE_DAYS, 3 * 366),
  };
}

export function icsResponse(body: string, filename: string, download: boolean): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
