import { randomUUID } from "node:crypto";
import { validateCollectionInput } from "@/core/events/schema";
import { addCollection } from "@/core/events/store";
import { checkEditToken, errorResponse, json } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = checkEditToken(req);
  if (denied) return denied;
  const v = validateCollectionInput(await req.json().catch(() => null));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    return json(await mutate((doc) => addCollection(doc, v.value, randomUUID())), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
