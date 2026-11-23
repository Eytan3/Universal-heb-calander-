import { randomUUID } from "node:crypto";
import { validateEventInput } from "@/core/events/schema";
import { addEvent } from "@/core/events/store";
import { checkEditToken, errorResponse, json } from "@/server/http";
import { getStore, mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = getStore();
    const doc = await store.load();
    return json({ ...doc, storage: store.kind });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = checkEditToken(req);
  if (denied) return denied;
  const v = validateEventInput(await req.json().catch(() => null));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    return json(await mutate((doc) => addEvent(doc, v.value, randomUUID())), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
