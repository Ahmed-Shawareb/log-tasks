import { route } from "@/server/api";
import { readAttachment, removeAttachment } from "@/server/services/files";

type P = { id: string };

export const GET = route<P>(async ({ req, user, params }) => {
  const { att, bytes } = await readAttachment(user, params.id);
  const inline = req.nextUrl.searchParams.get("inline") === "1" && /^image\/(png|jpeg|gif|webp)$|^application\/pdf$/.test(att.mimeType);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = route<P>(async ({ user, params }) => {
  await removeAttachment(user, params.id);
  return { ok: true };
});
