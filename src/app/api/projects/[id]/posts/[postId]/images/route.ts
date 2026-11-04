import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { addPostImage } from "@/server/services/social";

type P = { id: string; postId: string };
export const POST = route<P>(async ({ req, user, params }) => {
  const form = await req.formData().catch(() => { throw new AppError("INVALID", "Send the image as a file upload."); });
  return addPostImage(user, params.id, params.postId, form.get("file") as File);
});
