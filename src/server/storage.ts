/**
 * Server-side persistence for the event store document.
 *
 * The whole store is one small JSON document (schema v1), read and written atomically.
 * Backends, chosen at runtime:
 *   - "redis": Redis, either over Upstash's REST API or the standard Redis protocol (REDIS_URL).
 *              Variable names are detected flexibly; see detectRedis().
 *   - "file":  a JSON file on local disk (default for `next dev` / `next start` / self-hosting).
 *   - "none":  on Vercel with no Redis configured — serverless file systems are not persistent,
 *              so the server refuses to pretend; the UI falls back to browser storage.
 *
 * Concurrency: last write wins. Acceptable for a single-user prototype; see ARCHITECTURE.md.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyDocument, parseDocument, type EventStoreDocument } from "@/core/events/schema";

export type StorageKind = "redis" | "file" | "none";

export interface DocumentStore {
  kind: StorageKind;
  load(): Promise<EventStoreDocument>;
  save(doc: EventStoreDocument): Promise<void>;
}

class FileStore implements DocumentStore {
  kind = "file" as const;
  constructor(private file: string) {}
  async load() {
    try {
      return parseDocument(JSON.parse(await fs.readFile(this.file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyDocument();
      throw e;
    }
  }
  async save(doc: EventStoreDocument) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
    await fs.rename(tmp, this.file); // atomic replace
  }
}

class UpstashStore implements DocumentStore {
  kind = "redis" as const;
  constructor(private url: string, private token: string, private key: string) {}
  private async command(cmd: string[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Redis error: ${body.error ?? res.status}`);
    return body.result;
  }
  async load() {
    const raw = await this.command(["GET", this.key]);
    return raw ? parseDocument(JSON.parse(String(raw))) : emptyDocument();
  }
  async save(doc: EventStoreDocument) {
    await this.command(["SET", this.key, JSON.stringify(doc)]);
  }
}

class NoStore implements DocumentStore {
  kind = "none" as const;
  async load() { return emptyDocument(); }
  async save(): Promise<void> { throw new StorageUnavailableError(); }
}

export class StorageUnavailableError extends Error {
  constructor() { super("Server storage is not configured: connect a Redis database (REDIS_URL or Upstash REST variables)."); }
}

/** Standard Redis protocol (redis:// or rediss://), e.g. Vercel's "Redis" marketplace database (REDIS_URL). */
class RedisUrlStore implements DocumentStore {
  kind = "redis" as const;
  private client: Promise<import("redis").RedisClientType> | null = null;
  constructor(private url: string, private key: string) {}
  private connect() {
    if (!this.client) {
      this.client = import("redis").then(async ({ createClient }) => {
        const c = createClient({ url: this.url, socket: { connectTimeout: 8000 } }) as import("redis").RedisClientType;
        c.on("error", (e) => console.error("redis client error", e));
        await c.connect();
        return c;
      });
      this.client.catch(() => { this.client = null; }); // retry on next request
    }
    return this.client;
  }
  async load() {
    const raw = await (await this.connect()).get(this.key);
    return raw ? parseDocument(JSON.parse(raw)) : emptyDocument();
  }
  async save(doc: EventStoreDocument) {
    await (await this.connect()).set(this.key, JSON.stringify(doc));
  }
}

export type RedisConfig =
  | { protocol: "rest"; url: string; token: string; vars: string[] }
  | { protocol: "redis"; url: string; vars: string[] };

/**
 * Find Redis credentials under any of the names hosting integrations use:
 *  - REST (Upstash): UPSTASH_REDIS_REST_URL/TOKEN, KV_REST_API_URL/TOKEN, or any <PREFIX>_REST_API_URL/TOKEN
 *    or <PREFIX>_REDIS_REST_URL/TOKEN pair (Vercel lets you choose a custom prefix);
 *  - Redis protocol: REDIS_URL, KV_URL, or any <PREFIX>_REDIS_URL / <PREFIX>_URL holding a redis(s):// URL.
 * REST is preferred when both exist. Only variable *names* are ever reported.
 */
export function detectRedis(env: Record<string, string | undefined> = process.env): RedisConfig | null {
  const pairs: [string, string][] = [["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], ["KV_REST_API_URL", "KV_REST_API_TOKEN"]];
  for (const k of Object.keys(env).sort()) {
    let m = /^(.+)_REST_API_URL$/.exec(k);
    if (m) pairs.push([k, `${m[1]}_REST_API_TOKEN`]);
    m = /^(.+)_REDIS_REST_URL$/.exec(k);
    if (m) pairs.push([k, `${m[1]}_REDIS_REST_TOKEN`]);
  }
  for (const [u, t] of pairs) {
    if (env[u] && env[t] && /^https:\/\//.test(env[u]!)) return { protocol: "rest", url: env[u]!, token: env[t]!, vars: [u, t] };
  }
  const urlNames = ["REDIS_URL", "KV_URL", ...Object.keys(env).sort().filter((k) => /(^|_)(REDIS_URL|URL)$/.test(k))];
  for (const k of urlNames) {
    const v = env[k];
    if (v && /^rediss?:\/\//.test(v)) return { protocol: "redis", url: v, vars: [k] };
  }
  return null;
}

let cached: DocumentStore | null = null;

export function getStore(): DocumentStore {
  if (cached) return cached;
  const env = process.env;
  const key = env.UC_REDIS_KEY ?? "universal-calendar:events:v1";
  const redis = detectRedis(env);
  if (redis?.protocol === "rest") cached = new UpstashStore(redis.url, redis.token, key);
  else if (redis?.protocol === "redis") cached = new RedisUrlStore(redis.url, key);
  else if (env.VERCEL && !env.UC_DATA_FILE) cached = new NoStore();
  else cached = new FileStore(path.resolve(/*turbopackIgnore: true*/ env.UC_DATA_FILE ?? path.join(process.cwd(), "data", "events.json")));
  return cached;
}

/** Serialise read-modify-write cycles within one server process. */
let chain: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (doc: EventStoreDocument) => Promise<T> | T): Promise<T> {
  const run = chain.then(async () => {
    const store = getStore();
    const doc = await store.load();
    const result = await fn(doc);
    await store.save(doc);
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}
