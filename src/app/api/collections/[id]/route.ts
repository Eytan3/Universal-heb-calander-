import { UID_PATTERN, validateCollectionInput } from "@/core/events/schema";
import { changeCollection, removeCollection } from "@/core/events/store";
import { guard, errorResponse, json, readJson } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UID_PATTERN.test(id)) return json({ error: "bad id" }, 400);
  const v = validateCollectionInput(await readJson(req));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    return json(await mutate((doc) => changeCollection(doc, id, v.value)));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Deletes the calendar and all of its events. */
export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return json(await mutate((doc) => removeCollection(doc, id)));
  } catch (e) {
    return errorResponse(e);
  }
}
