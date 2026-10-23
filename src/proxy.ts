import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "log_session";
const PUBLIC = ["/login", "/forgot-password", "/reset-password"];

// Optimistic gate only — real authentication & authorisation run on the server for every page and API call.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (pathname === "/") return NextResponse.redirect(new URL(hasSession ? "/dashboard" : "/login", request.url));
  if (!hasSession && !PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
