import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, secretUsable, sessionKeyMaterial, verifySession } from "./lib/session";

// Every route except /login (and static build files) needs a valid signed session cookie.
export async function proxy(req: NextRequest) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = !!password && secretUsable(secret) && (await verifySession(token, sessionKeyMaterial(secret, password)));
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  const from = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  url.search = "";
  if (req.method === "GET" && from !== "/") url.searchParams.set("from", from.slice(0, 300));
  const res = NextResponse.redirect(url, 303);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon\\.ico|robots\\.txt|icon\\.svg).*)"],
};
