import { describe, expect, it } from "vitest";
import { authConfig, checkCredentials, createSession, feedToken, isAuthorized, publicView, readCookie, SESSION_COOKIE, verifySession } from "@/server/auth";

const env = { UC_USER: "eytan", UC_PASSWORD: "correct horse battery staple" };
const cfg = authConfig(env);

describe("owner login", () => {
  it("is off without credentials and misconfigured with only one of them", () => {
    expect(authConfig({}).mode).toBe("off");
    expect(authConfig({ UC_USER: "a" }).mode).toBe("misconfigured");
    expect(authConfig({ UC_PASSWORD: "a" }).mode).toBe("misconfigured");
    expect(cfg.mode).toBe("on");
  });

  it("accepts only the exact user and password", async () => {
    expect(await checkCredentials(cfg, "eytan", env.UC_PASSWORD)).toBe(true);
    expect(await checkCredentials(cfg, "eytan", "wrong")).toBe(false);
    expect(await checkCredentials(cfg, "Eytan", env.UC_PASSWORD)).toBe(false);
    expect(await checkCredentials(cfg, "", "")).toBe(false);
    expect(await checkCredentials(authConfig({}), "", "")).toBe(false);
  });

  it("issues sessions that verify, and rejects tampered or expired ones", async () => {
    const now = Date.UTC(2026, 10, 24);
    const s = await createSession(cfg, now);
    expect(await verifySession(cfg, s, now)).toBe(true);
    expect(await verifySession(cfg, s, now + 31 * 86400_000)).toBe(false); // expired
    const [v, u, exp, sig] = s.split(".");
    expect(await verifySession(cfg, [v, u, String(Number(exp) + 999999), sig].join("."), now)).toBe(false); // extended expiry
    expect(await verifySession(cfg, [v, u, exp, sig.slice(0, -2) + "AA"].join("."), now)).toBe(false); // forged signature
    expect(await verifySession(cfg, "", now)).toBe(false);
    expect(await verifySession(cfg, "garbage", now)).toBe(false);
  });

  it("logs every device out when the password changes", async () => {
    const s = await createSession(cfg);
    expect(await verifySession(authConfig({ ...env, UC_PASSWORD: "new password" }), s)).toBe(false);
    expect(await verifySession(authConfig({ ...env, UC_SESSION_SECRET: "x" }), s)).toBe(false);
  });

  it("checks the session cookie on requests", async () => {
    const s = await createSession(cfg);
    const req = (cookie?: string) => new Request("https://x.test/api/events", { headers: cookie ? { cookie } : {} });
    expect(await isAuthorized(req(`a=1; ${SESSION_COOKIE}=${s}; b=2`), env)).toBe(true);
    expect(await isAuthorized(req(), env)).toBe(false);
    expect(await isAuthorized(req(), {})).toBe(true); // login off
    expect(await isAuthorized(req(), { UC_USER: "x" })).toBe(false); // misconfigured fails closed
    expect(readCookie("a=1; b=2", "b")).toBe("2");
  });

  it("is private by default, public (view-only) on request", () => {
    expect(publicView({})).toBe(false);
    expect(publicView({ UC_VISIBILITY: "private" })).toBe(false);
    expect(publicView({ UC_VISIBILITY: " Public " })).toBe(true);
  });

  it("feed: open on a public calendar; a stable private token on a private one, or UC_FEED_TOKEN", async () => {
    expect(await feedToken({})).toBe("");
    expect(await feedToken({ ...env, UC_VISIBILITY: "public" })).toBe(""); // public calendar → public feed
    const priv = env; // private by default
    const t = await feedToken(priv);
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await feedToken(priv)).toBe(t);
    expect(await feedToken({ ...priv, UC_PASSWORD: "other" })).not.toBe(t);
    expect(await feedToken({ ...env, UC_FEED_TOKEN: "fixed" })).toBe("fixed");
  });
});
