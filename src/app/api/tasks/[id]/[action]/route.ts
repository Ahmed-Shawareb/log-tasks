import { z } from "zod";
import { route } from "@/server/api";
import { notFound } from "@/server/errors";
import {
  addChecklistItem, addComment, addDependency, archiveTask, changeStatus, duplicateTask, logTime, removeDependency,
  reviewTask, scheduleTask, startTimer, submitWork,
} from "@/server/services/tasks";
import { uploadAttachment } from "@/server/services/files";

type P = { id: string; action: string };

/** POST /api/tasks/:id/:action — every task workflow action in one place. */
export const POST = route<P>(async ({ req, user, params }) => {
  const { id, action } = params;
  switch (action) {
    case "status": return changeStatus(user, id, await req.json());
    case "submit": return submitWork(user, id, await req.json());
    case "review": return reviewTask(user, id, await req.json());
    case "schedule": return scheduleTask(user, id, await req.json());
    case "comments": return addComment(user, id, await req.json());
    case "checklist": return addChecklistItem(user, id, z.object({ text: z.string() }).parse(await req.json()).text);
    case "dependencies": return addDependency(user, id, z.object({ dependsOnId: z.string() }).parse(await req.json()).dependsOnId);
    case "time": return logTime(user, id, await req.json());
    case "timer": return startTimer(user, id);
    case "archive": return archiveTask(user, id, z.object({ archived: z.boolean() }).parse(await req.json()).archived);
    case "duplicate": return duplicateTask(user, id);
    case "attachments": {
      const form = await req.formData();
      return uploadAttachment(user, id, form.get("file") as File);
    }
    default: throw notFound("Action");
  }
});

export const DELETE = route<P>(async ({ req, user, params }) => {
  if (params.action === "dependencies") {
    await removeDependency(user, params.id, req.nextUrl.searchParams.get("dependsOnId") ?? "");
    return { ok: true };
  }
  throw notFound("Action");
});
