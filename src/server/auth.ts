/**
 * Single-owner login (user + password), configured only through environment variables:
 *   UC_USER, UC_PASSWORD        both set → login required for the app and its API
 *   UC_SESSION_SECRET           optional extra secret mixed into session/feed keys
 *   UC_VISIBILITY               "private" (default): the web app needs the login even to view;
 *                               calendar apps use the feed link with its private token
 *                               "public": anyone may view read-only, only the owner may change anything
 *   UC_FEED_TOKEN               optional fixed token for the Apple Calendar feed (with a private
 *                               calendar one is otherwise derived from the credentials)
 *
 * Sessions are stateless: an HMAC-signed cookie `v1.<user>.<expiry>.<signature>`.
 * The signing key is derived from the credentials, so changing the password logs out every device.
 * Uses Web Crypto only, so the same code runs in the proxy and in route handlers.
 */

export const SESSION_COOKIE = "ittim_session";
export const SESSION_DAYS = 30;

type Env = Record<string, string | undefined>;

export type AuthConfig =
  | { mode: "off" }
  | { mode: "misconfigured" }
  | { mode: "on"; user: string; password: string; extra: string };

export function authConfig(env: Env = process.env): AuthConfig {
  const user = env.UC_USER ?? "";
  const password = env.UC_PASSWORD ?? "";
  if (!user && !password) return { mode: "off" };
  if (!user || !password) return { mode: "misconfigured" };
  return { mode: "on", user, password, extra: env.UC_SESSION_SECRET ?? "" };
}

/** With login on: may people who are not signed in still view the calendar (read-only)? */
export function publicView(env: Env = process.env): boolean {
  return (env.UC_VISIBILITY ?? "").trim().toLowerCase() === "public";
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time comparison of two byte arrays of equal length. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Compare two strings without leaking where they differ (hash both, then compare digests). */
export async function safeEqualText(a: string, b: string): Promise<boolean> {
  return sameBytes(await sha256(a), await sha256(b));
}

async function masterKey(cfg: Extract<AuthConfig, { mode: "on" }>): Promise<Uint8Array> {
  return sha256(`ittim-auth\0${cfg.user}\0${cfg.password}\0${cfg.extra}`);
}

export async function checkCredentials(cfg: AuthConfig, user: string, password: string): Promise<boolean> {
  if (cfg.mode !== "on") return false;
  const okUser = await safeEqualText(user, cfg.user);
  const okPass = await safeEqualText(password, cfg.password);
  return okUser && okPass;
}

export async function createSession(cfg: AuthConfig, now = Date.now()): Promise<string> {
  if (cfg.mode !== "on") throw new Error("auth is not enabled");
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const payload = `v1.${b64url(enc.encode(cfg.user))}.${exp}`;
  return `${payload}.${b64url(await hmac(await masterKey(cfg), `session:${payload}`))}`;
}

export async function verifySession(cfg: AuthConfig, cookie: string | undefined, now = Date.now()): Promise<boolean> {
  if (cfg.mode !== "on" || !cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d{1,12}$/.test(parts[2])) return false;
  if (Number(parts[2]) * 1000 < now) return false;
  const payload = parts.slice(0, 3).join(".");
  const expected = b64url(await hmac(await masterKey(cfg), `session:${payload}`));
  if (!(await safeEqualText(parts[3], expected))) return false;
  return safeEqualText(parts[1], b64url(enc.encode(cfg.user)));
}

/** Token that unlocks /calendar.ics for calendar apps (which cannot log in). Empty → feed is open (as the calendar is). */
export async function feedToken(env: Env = process.env): Promise<string> {
  if (env.UC_FEED_TOKEN) return env.UC_FEED_TOKEN;
  const cfg = authConfig(env);
  if (cfg.mode !== "on" || publicView(env)) return "";
  return b64url(await hmac(await masterKey(cfg), "feed")).slice(0, 32);
}

/** Read one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function sessionCookie(value: string, secure: boolean, maxAge = SESSION_DAYS * 86400): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** Is this request logged in (or is login not required at all)? */
export async function isAuthorized(req: Request, env: Env = process.env): Promise<boolean> {
  const cfg = authConfig(env);
  if (cfg.mode === "off") return true;
  if (cfg.mode === "misconfigured") return false;
  return verifySession(cfg, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
}
