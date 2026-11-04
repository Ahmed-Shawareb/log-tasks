import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api";
import { requirePortalApi } from "@/server/portal";
import { portalOverview } from "@/server/services/portal-data";

export async function GET() {
  try {
    const u = await requirePortalApi();
    return NextResponse.json(await portalOverview(u.clientId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
