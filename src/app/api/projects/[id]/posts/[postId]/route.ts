import { route } from "@/server/api";
import { updatePost } from "@/server/services/social";

type P = { id: string; postId: string };
export const PATCH = route<P>(async ({ req, user, params }) => updatePost(user, params.id, params.postId, await req.json()));
