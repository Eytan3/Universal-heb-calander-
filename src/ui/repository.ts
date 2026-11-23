/**
 * Client-side access to event definitions. Two interchangeable implementations:
 *  - ServerRepository: the API (source of truth for the ICS feed).
 *  - BrowserRepository: localStorage, used only when the server reports no storage.
 * Both apply the same core create/update rules, so documents are identical in shape.
 */
import {
  emptyDocument, parseDocument,
  type Collection, type CollectionInput, type EventInput, type EventStoreDocument, type UCEvent,
} from "@/core/events/schema";
import { addCollection, addEvent, changeCollection, removeCollection, removeEvent, replaceEvent } from "@/core/events/store";

import { isPreview } from "./preview";

export interface EventRepository {
  kind: "server" | "browser";
  storage: string;
  load(): Promise<EventStoreDocument>;
  create(input: EventInput): Promise<UCEvent>;
  update(uid: string, input: EventInput): Promise<UCEvent>;
  remove(uid: string): Promise<void>;
  createCollection(input: CollectionInput): Promise<Collection>;
  updateCollection(id: string, input: CollectionInput): Promise<Collection>;
  removeCollection(id: string): Promise<void>;
}

export class AuthRequiredError extends Error {}

const TOKEN_KEY = "universal-calendar:edit-token";
export const getEditToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
export const setEditToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getEditToken();
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    cache: "no-store",
  });
  if (res.status === 401) throw new AuthRequiredError("edit token required");
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.errors?.join(", ") ?? body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export class ServerRepository implements EventRepository {
  kind = "server" as const;
  constructor(public storage: string) {}
  async load() { return parseDocument(await call<EventStoreDocument>("/api/events")); }
  create(input: EventInput) { return call<UCEvent>("/api/events", { method: "POST", body: JSON.stringify(input) }); }
  update(uid: string, input: EventInput) { return call<UCEvent>(`/api/events/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify(input) }); }
  async remove(uid: string) { await call<void>(`/api/events/${encodeURIComponent(uid)}`, { method: "DELETE" }); }
  createCollection(input: CollectionInput) { return call<Collection>("/api/collections", { method: "POST", body: JSON.stringify(input) }); }
  updateCollection(id: string, input: CollectionInput) { return call<Collection>(`/api/collections/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }); }
  async removeCollection(id: string) { await call<unknown>(`/api/collections/${encodeURIComponent(id)}`, { method: "DELETE" }); }
}

const LOCAL_KEY = "universal-calendar:events:v1";

/** Same operations as the server (core/events/store.ts), kept in this browser's localStorage. */
export class BrowserRepository implements EventRepository {
  kind = "browser" as const;
  storage = "localStorage";
  private read(): EventStoreDocument {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? parseDocument(JSON.parse(raw)) : emptyDocument();
    } catch {
      return emptyDocument();
    }
  }
  private apply<T>(fn: (doc: EventStoreDocument) => T): T {
    const doc = this.read();
    const result = fn(doc);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); // throws if storage is unavailable: surfaced to the UI
    return result;
  }
  async load() { return this.read(); }
  async create(input: EventInput) { return this.apply((d) => addEvent(d, input, crypto.randomUUID())); }
  async update(uid: string, input: EventInput) { return this.apply((d) => replaceEvent(d, uid, input)); }
  async remove(uid: string) { this.apply((d) => removeEvent(d, uid)); }
  async createCollection(input: CollectionInput) { return this.apply((d) => addCollection(d, input, crypto.randomUUID())); }
  async updateCollection(id: string, input: CollectionInput) { return this.apply((d) => changeCollection(d, id, input)); }
  async removeCollection(id: string) { this.apply((d) => removeCollection(d, id)); }
}

export async function chooseRepository(): Promise<EventRepository> {
  if (isPreview()) return new BrowserRepository(); // standalone preview page: no server
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const s = (await res.json()) as { storage: string };
    return s.storage === "none" ? new BrowserRepository() : new ServerRepository(s.storage);
  } catch {
    return new BrowserRepository();
  }
}
