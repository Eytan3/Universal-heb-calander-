import { authConfig, checkCredentials, createSession, sessionCookie } from "@/server/auth";
import { json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Small in-memory brake on password guessing (per server instance; every failure also waits). */
const failures = new Map<string, { count: number; until: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}

export async function POST(req: Request) {
  const cfg = authConfig();
  if (cfg.mode === "off") return json({ error: "login is not enabled" }, 404);
  if (cfg.mode === "misconfigured") return json({ error: "login misconfigured: set both UC_USER and UC_PASSWORD" }, 500);

  const key = clientKey(req);
  const now = Date.now();
  const f = failures.get(key);
  if (f && f.until > now) return json({ error: "too many attempts", retryAfter: Math.ceil((f.until - now) / 1000) }, 429);

  const body = (await readJson(req, 4096)) as { user?: unknown; password?: unknown } | null;
  const user = typeof body?.user === "string" ? body.user : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!(await checkCredentials(cfg, user, password))) {
    const count = (f?.count ?? 0) + 1;
    // After 5 failures, lock this client out for 30 s, doubling each time (max 15 min).
    const until = count >= 5 ? now + Math.min(15 * 60_000, 30_000 * 2 ** (count - 5)) : 0;
    failures.set(key, { count, until });
    if (failures.size > 10_000) failures.clear();
    await sleep(700);
    return json({ error: "wrong user or password" }, 401);
  }
  failures.delete(key);
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(await createSession(cfg), secure) },
  });
}
