import { NextResponse, type NextRequest } from "next/server";
import { authConfig, isAuthorized } from "@/server/auth";

/**
 * Owner login gate. With UC_USER + UC_PASSWORD set, every page and API call needs a session,
 * except the login page itself and the calendar feeds (which check their own token,
 * since calendar apps cannot log in). Route handlers check the session again.
 */
const PUBLIC = [/^\/login\/?$/, /^\/api\/login\/?$/, /^\/api\/logout\/?$/, /^\/calendar\.ics$/, /^\/holidays\.ics$/];

export async function proxy(req: NextRequest) {
  const mode = authConfig().mode;
  const path = req.nextUrl.pathname;
  if (mode === "off") {
    return path === "/login" ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();
  if (mode === "on" && (await isAuthorized(req))) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: mode === "on" ? "login required" : "login misconfigured" }, { status: mode === "on" ? 401 : 500 });
  }
  const to = new URL("/login", req.url);
  if (path !== "/") to.searchParams.set("next", path);
  return NextResponse.redirect(to);
}

export const config = {
  // Everything except Next's static assets and the app icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
