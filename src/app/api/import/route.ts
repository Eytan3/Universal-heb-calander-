import { randomUUID } from "node:crypto";
import { importBackup } from "@/core/events/import";
import { errorResponse, guard, json, readJson } from "@/server/http";
import { mutate } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Import an Ittim backup (.json). Adds calendars and events; never deletes or overwrites. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await readJson(req, 4 * 1024 * 1024);
  if (!body) return json({ errors: ["the file is not valid JSON or is larger than 4 MB"] }, 400);
  try {
    return json(await mutate((doc) => importBackup(doc, body, randomUUID)));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("not an Ittim backup")) return json({ errors: [e.message] }, 400);
    return errorResponse(e);
  }
}
