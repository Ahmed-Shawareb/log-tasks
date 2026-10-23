import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { forbidden, invalid, notFound } from "../errors";
import { activity } from "../audit";
import { canManageTask, taskScope, type SessionUser } from "../permissions";

// Private storage: local ./storage (dev) or a private Supabase Storage bucket (hosted).
// Files are never served from a public URL — every download goes through an authorised route.

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 4);
export const MAX_UPLOAD_BYTES = Math.max(1, MAX_MB) * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/gif": [".gif"], "image/webp": [".webp"],
  "application/pdf": [".pdf"], "text/plain": [".txt"], "text/csv": [".csv"],
  "application/zip": [".zip"], "application/x-zip-compressed": [".zip"],
  "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"], "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "video/mp4": [".mp4"], "audio/mpeg": [".mp3"],
};
export const ALLOWED_EXTENSIONS = [...new Set(Object.values(ALLOWED).flat())];

const supabase = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key, bucket: process.env.SUPABASE_STORAGE_BUCKET || "log-attachments" } : null;
};
const localRoot = () => path.join(process.cwd(), "storage", "uploads");

async function putObject(key: string, bytes: Buffer, mime: string) {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, "Content-Type": mime, "x-upsert": "false" },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
    return;
  }
  if (process.env.VERCEL) throw new Error("File storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const file = path.join(localRoot(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function getObject(key: string): Promise<Buffer> {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/authenticated/${sb.bucket}/${key}`, {
      headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key },
    });
    if (!res.ok) throw notFound("File");
    return Buffer.from(await res.arrayBuffer());
  }
  const file = path.join(localRoot(), key);
  if (!file.startsWith(localRoot())) throw notFound("File");
  return readFile(file).catch(() => { throw notFound("File"); });
}

async function deleteObject(key: string) {
  const sb = supabase();
  if (sb) {
    await fetch(`${sb.url}/storage/v1/object/${sb.bucket}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    }).catch(() => {});
    return;
  }
  await unlink(path.join(localRoot(), key)).catch(() => {});
}

/** Magic-byte sniffing for the types where a renamed executable could matter. */
function sniffOk(mime: string, b: Buffer) {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/gif") return starts(0x47, 0x49, 0x46);
  if (mime === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46);
  if (mime.includes("zip") || mime.includes("openxmlformats")) return starts(0x50, 0x4b);
  if (b.length > 1 && starts(0x4d, 0x5a)) return false; // Windows executable
  return true;
}

export async function uploadAttachment(actor: SessionUser, taskId: string, file: File) {
  const task = await db.task.findFirst({ where: { AND: [{ id: taskId }, taskScope(actor)] }, include: { department: { select: { key: true } }, project: { select: { accountManagerId: true } } } });
  if (!task) throw notFound("Task");
  if (task.assigneeId !== actor.id && !canManageTask(actor, task)) throw forbidden("Only the assignee or a manager can attach files.");
  if (!file || typeof file.arrayBuffer !== "function") throw invalid("No file received.");
  if (file.size > MAX_UPLOAD_BYTES) throw invalid(`Files must be ${MAX_MB} MB or smaller. Share larger files as a link.`);
  const ext = path.extname(file.name).toLowerCase();
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED[mime]?.includes(ext)) throw invalid(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(mime, bytes)) throw invalid("The file content does not match its type.");

  const safeName = file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || `file${ext}`;
  const key = `${task.id}/${randomBytes(16).toString("hex")}${ext}`;
  await putObject(key, bytes, mime);
  const att = await db.attachment.create({ data: { taskId: task.id, uploaderId: actor.id, fileName: safeName, mimeType: mime, size: file.size, storageKey: key } });
  await activity(db, actor.id, "task.attachment", { taskId: task.id }, { fileName: safeName });
  return att;
}

export async function readAttachment(actor: SessionUser, id: string) {
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) throw notFound("File");
  const visible = await db.task.count({ where: { AND: [{ id: att.taskId }, taskScope(actor)] } });
  if (!visible) throw notFound("File");
  return { att, bytes: await getObject(att.storageKey) };
}

export async function removeAttachment(actor: SessionUser, id: string) {
  const att = await db.attachment.findUnique({ where: { id }, include: { task: { include: { department: { select: { key: true } }, project: { select: { accountManagerId: true } } } } } });
  if (!att) throw notFound("File");
  if (att.submissionId) throw invalid("Files that are part of a submission are kept for the review history.");
  if (att.uploaderId !== actor.id && !canManageTask(actor, att.task)) throw forbidden();
  await db.attachment.delete({ where: { id } });
  await deleteObject(att.storageKey);
}
