import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { requireApiUser } from "./session";
import type { SessionUser } from "./permissions";

/** CSRF defence: state-changing requests must come from our own origin (cookies are SameSite=Lax too). */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) {
    if (req.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Cross-site request blocked.");
    return; // non-browser clients (tests, CLI) send no Origin
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* malformed */
  }
  if (!host || originHost !== host) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const msg = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.";
    return NextResponse.json({ error: msg, code: "INVALID" }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: "That record already exists.", code: "CONFLICT" }, { status: 409 });
    if (e.code === "P2003") return NextResponse.json({ error: "A referenced record does not exist.", code: "INVALID" }, { status: 400 });
    if (e.code === "P2025") return NextResponse.json({ error: "Record not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: "Something went wrong. Please try again.", code: "INTERNAL" }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Authenticated route handler: CSRF check, session, consistent error shape. */
export function route<P = Record<string, string>>(
  fn: (args: { req: NextRequest; user: SessionUser; params: P }) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const user = await requireApiUser();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn({ req, user, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Route that does not require a session (login, password reset). */
export function publicRoute<P = Record<string, string>>(fn: (args: { req: NextRequest; params: P }) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn({ req, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("INVALID", "Request body must be JSON.");
  }
  return schema.parse(raw);
}

export const searchParams = (req: NextRequest) => Object.fromEntries(req.nextUrl.searchParams.entries());
