/**
 * Server-side persistence for the event store document.
 *
 * The whole store is one small JSON document (schema v1), read and written atomically.
 * Backends, chosen at runtime:
 *   - "redis": Upstash Redis over its REST API (works on Vercel; free tier). Selected when
 *              UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN are set.
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
  constructor() { super("Server storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."); }
}

let cached: DocumentStore | null = null;

export function getStore(): DocumentStore {
  if (cached) return cached;
  const env = process.env;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) cached = new UpstashStore(url, token, env.UC_REDIS_KEY ?? "universal-calendar:events:v1");
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
