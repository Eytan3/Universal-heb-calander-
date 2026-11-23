import { authConfig, feedToken, isAuthorized } from "@/server/auth";
import { json } from "@/server/http";
import { detectRedis, getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const mode = authConfig().mode;
  const signedIn = mode === "on" && (await isAuthorized(req));
  if (mode !== "off" && !signedIn) return json({ login: mode === "on" ? "required" : "misconfigured" }, 401);
  return json({
    storage: getStore().kind,
    // Names only (never values), to help diagnose hosting configuration.
    storageVariables: detectRedis()?.vars ?? [],
    editTokenRequired: mode === "off" && Boolean(process.env.UC_EDIT_TOKEN),
    feedTokenRequired: Boolean(await feedToken()),
    login: signedIn ? "signed-in" : "off",
    // Only ever sent to the signed-in owner: lets Settings show a working Apple Calendar link.
    ...(signedIn ? { feedToken: await feedToken(), user: process.env.UC_USER } : {}),
  });
}
