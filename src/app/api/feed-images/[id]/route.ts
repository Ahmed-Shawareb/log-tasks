import type { NextRequest } from "next/server";
import { errorResponse, route } from "@/server/api";
import { getCurrentUser } from "@/server/session";
import { getPortalUser } from "@/server/portal";
import { imageResponse, readPostImage, removePostImage } from "@/server/services/social";
import { AppError } from "@/server/errors";

type P = { id: string };

// Read by staff (anyone who can see the project) or by that client's dashboard login.
export async function GET(_req: NextRequest, ctx: { params: Promise<P> }) {
  try {
    const { id } = await ctx.params;
    const staff = await getCurrentUser();
    if (staff) {
      const { media, bytes } = await readPostImage({ staff }, id);
      return imageResponse(media, bytes);
    }
    const client = await getPortalUser();
    if (!client) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    const { media, bytes } = await readPostImage({ clientId: client.clientId }, id);
    return imageResponse(media, bytes);
  } catch (e) {
    return errorResponse(e);
  }
}

export const DELETE = route<P>(async ({ user, params }) => {
  await removePostImage(user, params.id);
  return { ok: true };
});
