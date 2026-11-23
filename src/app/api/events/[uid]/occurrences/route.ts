import { randomUUID } from "node:crypto";
import { UID_PATTERN, validateEventInput, type EventInput } from "@/core/events/schema";
import { applyOccurrenceAction, OCCURRENCE_ACTIONS, type OccurrenceAction } from "@/core/events/store";
import { checkEditToken, errorResponse, json, readJson } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ uid: string }> };

/**
 * Act on one occurrence of a recurring event, atomically:
 *   { action: "edit-this" | "edit-future" | "delete-this" | "delete-future", recurrenceId: <EpochDay>, input?: EventInput }
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = checkEditToken(req);
  if (denied) return denied;
  const { uid } = await params;
  if (!UID_PATTERN.test(uid)) return json({ error: "bad uid" }, 400);
  const body = (await readJson(req)) as { action?: string; recurrenceId?: unknown; input?: unknown } | null;
  const action = body?.action as OccurrenceAction;
  const rid = Number(body?.recurrenceId);
  if (!OCCURRENCE_ACTIONS.includes(action)) return json({ errors: ["unknown action"] }, 400);
  if (!Number.isSafeInteger(rid)) return json({ errors: ["recurrenceId must be an integer day"] }, 400);
  let input: EventInput | undefined;
  if (action === "edit-this" || action === "edit-future") {
    const v = validateEventInput(body?.input);
    if (!v.ok) return json({ errors: v.errors }, 400);
    input = v.value;
  }
  try {
    return json(await mutate((doc) => applyOccurrenceAction(doc, uid, action, rid, input, randomUUID())));
  } catch (e) {
    return errorResponse(e);
  }
}
