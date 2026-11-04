import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { provisionProduction } from "@/server/provision";

export const dynamic = "force-dynamic";

/**
 * One-time production setup, for databases whose credentials cannot leave Vercel.
 * Disabled unless SETUP_TOKEN is set; remove SETUP_TOKEN after use. Requires "Authorization: Bearer <SETUP_TOKEN>".
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SETUP_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 32 || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    // ?reset=1 deletes ALL data except the roster accounts; it also needs an explicit confirmation header.
    const reset = req.nextUrl.searchParams.get("reset") === "1";
    if (reset && req.headers.get("x-confirm") !== "delete-all-data") return NextResponse.json({ error: "Send X-Confirm: delete-all-data to reset." }, { status: 400 });
    const shared = req.nextUrl.searchParams.get("shared") === "1";
    const result = await provisionProduction({ force: req.nextUrl.searchParams.get("force") === "1", reset, shared });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[setup] provisioning failed", e);
    return NextResponse.json({ error: "Provisioning failed — see function logs." }, { status: 500 });
  }
}
