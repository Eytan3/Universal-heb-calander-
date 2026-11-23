import { json } from "@/server/http";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

export function GET() {
  return json({
    storage: getStore().kind,
    editTokenRequired: Boolean(process.env.UC_EDIT_TOKEN),
    feedTokenRequired: Boolean(process.env.UC_FEED_TOKEN),
  });
}
