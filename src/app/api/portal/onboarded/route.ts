import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, publicRoute } from "@/server/api";
import { requirePortalApi } from "@/server/portal";

export const POST = publicRoute(async () => {
  try {
    const u = await requirePortalApi();
    await db.clientUser.update({ where: { id: u.id }, data: { onboardedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
});
