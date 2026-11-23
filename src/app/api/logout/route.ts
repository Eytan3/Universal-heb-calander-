import { sessionCookie } from "@/server/auth";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", secure, 0) } });
}
