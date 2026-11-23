import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEvent } from "@/core/events/schema";

const event = createEvent({ title: "x", start: { calendar: "hebrew", year: 5787, monthCode: "M03", day: 15 } }, "u1");

async function freshStorage(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "UC_DATA_FILE"]) delete process.env[k];
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
    expect(saved).toEqual({ schemaVersion: 1, events: [event] });
    expect((await getStore().load()).events[0].start).toEqual(event.start);
  });

  it("refuses to fake persistence on Vercel without Redis", async () => {
    const { getStore, StorageUnavailableError } = await freshStorage({ VERCEL: "1" });
    expect(getStore().kind).toBe("none");
    await expect(getStore().save({ schemaVersion: 1, events: [] })).rejects.toBeInstanceOf(StorageUnavailableError);
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
