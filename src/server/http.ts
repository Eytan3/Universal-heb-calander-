import { timingSafeEqual } from "node:crypto";
import { StoreError } from "@/core/events/store";
import { StorageUnavailableError } from "./storage";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Optional shared-secret protection (not an account system). When UC_EDIT_TOKEN is set,
 * writes require `Authorization: Bearer <token>`. Returns an error Response, or null if allowed.
 */
export function checkEditToken(req: Request): Response | null {
  const expected = process.env.UC_EDIT_TOKEN;
  if (!expected) return null;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(got, expected) ? null : json({ error: "edit token required" }, 401);
}

/** When UC_FEED_TOKEN is set, the ICS feed requires ?token=<token>. */
export function checkFeedToken(url: URL): boolean {
  const expected = process.env.UC_FEED_TOKEN;
  return !expected || safeEqual(url.searchParams.get("token") ?? "", expected);
}

export function errorResponse(e: unknown): Response {
  if (e instanceof StorageUnavailableError) return json({ error: e.message, storage: "none" }, 503);
  if (e instanceof StoreError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "internal error" }, 500);
}
