import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "log_session";
// /portal is the client dashboard: it has its own sign-in and checks its own cookie.
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/portal", "/space"];

// Optimistic gate only — real authentication & authorisation run on the server for every page and API call.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (pathname === "/") return NextResponse.redirect(new URL(hasSession ? "/dashboard" : "/login", request.url));
  if (!hasSession && !PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Lets server layouts know the page being opened (used to hold people on Settings until they change their password).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|space-icon.svg|log-logo.png|log-mark.png|favicon.ico|robots.txt).*)"],
};
