import { randomUUID } from "node:crypto";
import { validateEventInput } from "@/core/events/schema";
import { addEvent } from "@/core/events/store";
import { guard, errorResponse, json, readJson } from "@/server/http";
import { getStore, mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Reading: open on a public calendar; needs the login on a private one, or the edit token when that is set.
  const denied = await guard(req, "read");
  if (denied) return denied;
  try {
    const store = getStore();
    const doc = await store.load();
    return json({ ...doc, storage: store.kind });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const v = validateEventInput(await readJson(req));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    return json(await mutate((doc) => addEvent(doc, v.value, randomUUID())), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
