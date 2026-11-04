import { z } from "zod";
import { body, route } from "@/server/api";
import { swapPosts } from "@/server/services/social";

type P = { id: string };
export const POST = route<P>(async ({ req, user, params }) => {
  const { from, to } = await body(req, z.object({ from: z.string(), to: z.string() }));
  return swapPosts(user, params.id, from, to);
});
