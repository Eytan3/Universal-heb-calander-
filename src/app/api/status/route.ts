import { json } from "@/server/http";
import { detectRedis, getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

export function GET() {
  return json({
    storage: getStore().kind,
    // Names only (never values), to help diagnose hosting configuration.
    storageVariables: detectRedis()?.vars ?? [],
    editTokenRequired: Boolean(process.env.UC_EDIT_TOKEN),
    feedTokenRequired: Boolean(process.env.UC_FEED_TOKEN),
  });
}
