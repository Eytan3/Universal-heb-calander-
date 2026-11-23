/**
 * Client-side access to event definitions. Two interchangeable implementations:
 *  - ServerRepository: the API (source of truth for the ICS feed).
 *  - BrowserRepository: localStorage, used only when the server reports no storage.
 * Both apply the same core create/update rules, so documents are identical in shape.
 */
import {
  createEvent, emptyDocument, parseDocument, updateEvent,
  type EventInput, type EventStoreDocument, type UCEvent,
} from "@/core/events/schema";

export interface EventRepository {
  kind: "server" | "browser";
  storage: string;
  list(): Promise<UCEvent[]>;
  create(input: EventInput): Promise<UCEvent>;
  update(uid: string, input: EventInput): Promise<UCEvent>;
  remove(uid: string): Promise<void>;
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
  async list() { return (await call<EventStoreDocument>("/api/events")).events; }
  create(input: EventInput) { return call<UCEvent>("/api/events", { method: "POST", body: JSON.stringify(input) }); }
  update(uid: string, input: EventInput) { return call<UCEvent>(`/api/events/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify(input) }); }
  async remove(uid: string) { await call<void>(`/api/events/${encodeURIComponent(uid)}`, { method: "DELETE" }); }
}

const LOCAL_KEY = "universal-calendar:events:v1";

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
  private write(doc: EventStoreDocument) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); // throws if storage is unavailable: surfaced to the editor
  }
  async list() { return this.read().events; }
  async create(input: EventInput) {
    const doc = this.read();
    const e = createEvent(input, crypto.randomUUID());
    doc.events.push(e);
    this.write(doc);
    return e;
  }
  async update(uid: string, input: EventInput) {
    const doc = this.read();
    const i = doc.events.findIndex((e) => e.uid === uid);
    if (i < 0) throw new Error("not found");
    doc.events[i] = updateEvent(doc.events[i], input);
    this.write(doc);
    return doc.events[i];
  }
  async remove(uid: string) {
    const doc = this.read();
    doc.events = doc.events.filter((e) => e.uid !== uid);
    this.write(doc);
  }
}

export async function chooseRepository(): Promise<EventRepository> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const s = (await res.json()) as { storage: string };
    return s.storage === "none" ? new BrowserRepository() : new ServerRepository(s.storage);
  } catch {
    return new BrowserRepository();
  }
}
