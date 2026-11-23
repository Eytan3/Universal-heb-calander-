import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEvent, emptyDocument } from "@/core/events/schema";

const event = createEvent({ title: "x", start: { calendar: "hebrew", year: 5787, monthCode: "M03", day: 15 } }, "u1");

async function freshStorage(env: Record<string, string>) {
  vi.resetModules();
  for (const k of Object.keys(process.env)) if (/REDIS|KV_|UPSTASH|^VERCEL$|^UC_DATA_FILE$/.test(k)) delete process.env[k];
  Object.assign(process.env, env);
  return import("@/server/storage");
}

afterEach(() => vi.unstubAllGlobals());

describe("storage backends", () => {
  it("file store round-trips the documented JSON schema", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "uc-")), "events.json");
    const { getStore, mutate } = await freshStorage({ UC_DATA_FILE: file });
    expect(getStore().kind).toBe("file");
    await mutate((doc) => { doc.events.push(event); });
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved).toMatchObject({ schemaVersion: 2, collections: [{ id: "personal" }], events: [event] });
    expect((await getStore().load()).events[0].start).toEqual(event.start);
  });

  it("refuses to fake persistence on Vercel without Redis", async () => {
    const { getStore, StorageUnavailableError } = await freshStorage({ VERCEL: "1" });
    expect(getStore().kind).toBe("none");
    await expect(getStore().save(emptyDocument())).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it("Upstash store speaks the REST command protocol (simulated server)", async () => {
    const kv = new Map<string, string>();
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://example.upstash.io");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tkn");
      const [cmd, key, value] = JSON.parse(String(init.body));
      calls.push(cmd);
      if (cmd === "SET") kv.set(key, value);
      return Response.json({ result: cmd === "GET" ? kv.get(key) ?? null : "OK" });
    });
    const { getStore, mutate } = await freshStorage({ KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "tkn" });
    expect(getStore().kind).toBe("redis");
    await mutate((doc) => { doc.events.push(event); });
    expect(calls).toEqual(["GET", "SET"]);
    expect(JSON.parse(kv.get("universal-calendar:events:v1")!).events[0].uid).toBe("u1");
  });
});

describe("Redis configuration detection", () => {
  it("finds credentials under every naming scheme hosts use", async () => {
    const { detectRedis } = await freshStorage({});
    expect(detectRedis({ KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_TOKEN: "t", KV_REST_API_READ_ONLY_TOKEN: "r" }))
      .toMatchObject({ protocol: "rest", vars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"] });
    expect(detectRedis({ STORAGE_REST_API_URL: "https://a.upstash.io", STORAGE_REST_API_TOKEN: "t" }))
      .toMatchObject({ protocol: "rest", vars: ["STORAGE_REST_API_URL", "STORAGE_REST_API_TOKEN"] });
    expect(detectRedis({ REDIS_URL: "rediss://default:pw@host:6379" })).toMatchObject({ protocol: "redis", vars: ["REDIS_URL"] });
    expect(detectRedis({ MYDB_REDIS_URL: "redis://host:6379" })).toMatchObject({ protocol: "redis", vars: ["MYDB_REDIS_URL"] });
    expect(detectRedis({ DATABASE_URL: "postgres://x" })).toBeNull();
    // REST preferred when both are present
    expect(detectRedis({ REDIS_URL: "redis://h", KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_TOKEN: "t" })?.protocol).toBe("rest");
  });

  it("selects the Redis-protocol store when only REDIS_URL is set", async () => {
    const { getStore } = await freshStorage({ VERCEL: "1", REDIS_URL: "redis://localhost:1" });
    expect(getStore().kind).toBe("redis");
  });
});
