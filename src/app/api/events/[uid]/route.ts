import { UID_PATTERN, updateEvent, validateEventInput, type UCEvent } from "@/core/events/schema";
import { checkEditToken, errorResponse, json } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ uid: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = checkEditToken(req);
  if (denied) return denied;
  const { uid } = await params;
  if (!UID_PATTERN.test(uid)) return json({ error: "bad uid" }, 400);
  const v = validateEventInput(await req.json().catch(() => null));
  if (!v.ok) return json({ errors: v.errors }, 400);
  try {
    const updated = await mutate<UCEvent | null>((doc) => {
      const i = doc.events.findIndex((e) => e.uid === uid);
      if (i < 0) return null;
      doc.events[i] = updateEvent(doc.events[i], v.value);
      return doc.events[i];
    });
    return updated ? json(updated) : json({ error: "not found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = checkEditToken(req);
  if (denied) return denied;
  const { uid } = await params;
  try {
    const removed = await mutate((doc) => {
      const before = doc.events.length;
      doc.events = doc.events.filter((e) => e.uid !== uid);
      return doc.events.length < before;
    });
    return removed ? new Response(null, { status: 204 }) : json({ error: "not found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
