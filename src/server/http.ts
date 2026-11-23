import { timingSafeEqual } from "node:crypto";
import { StoreError } from "@/core/events/store";
import { StorageUnavailableError } from "./storage";
import { authConfig, feedToken, isAuthorized } from "./auth";

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

/**
 * Access check for every API route. With owner login enabled (UC_USER + UC_PASSWORD) a valid session
 * cookie is required (the proxy checks this too; this is the second line of defence). Otherwise the
 * optional UC_EDIT_TOKEN applies. Returns an error Response, or null if allowed.
 */
export async function guard(req: Request): Promise<Response | null> {
  const mode = authConfig().mode;
  if (mode === "misconfigured") return json({ error: "login misconfigured: set both UC_USER and UC_PASSWORD" }, 500);
  if (mode === "on") return (await isAuthorized(req)) ? null : json({ error: "login required" }, 401);
  return checkEditToken(req);
}

/**
 * The events feed requires ?token=<token> when UC_FEED_TOKEN is set, or when owner login is on
 * (then a token derived from the credentials is used, shown to the owner in Settings).
 */
export async function checkFeedToken(url: URL): Promise<boolean> {
  if (authConfig().mode === "misconfigured") return false;
  const expected = await feedToken();
  return !expected || safeEqual(url.searchParams.get("token") ?? "", expected);
}

/** Holidays carry no personal data: they only need a token when UC_FEED_TOKEN is explicitly set. */
export function checkHolidayFeedToken(url: URL): boolean {
  const expected = process.env.UC_FEED_TOKEN;
  return !expected || safeEqual(url.searchParams.get("token") ?? "", expected);
}

/** Parse a JSON body of at most 64 KB; anything larger or malformed yields null (→ 400 from validation). */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await req.text().catch(() => "");
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof StorageUnavailableError) return json({ error: e.message, storage: "none" }, 503);
  if (e instanceof StoreError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "internal error" }, 500);
}
