import { UID_PATTERN, validateEventInput } from "@/core/events/schema";
import { removeEvent, replaceEvent } from "@/core/events/store";
import { guard, errorResponse, json, readJson } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ uid: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { uid } = await params;
  if (!UID_PATTERN.test(uid)) return json({ error: "bad uid" }, 400);
  const v = validateEventInput(await readJson(req));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    return json(await mutate((doc) => replaceEvent(doc, uid, v.value)));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { uid } = await params;
  try {
    await mutate((doc) => removeEvent(doc, uid));
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
