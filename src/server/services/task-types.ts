import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { isAdmin, type SessionUser } from "../permissions";

export const taskTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  unit: z.string().trim().max(30).nullable().optional(),
  unitPlural: z.string().trim().max(30).nullable().optional(),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Ordered steps every unit goes through, e.g. ["Script writing", "Filming", "Editing"]. */
  stages: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

export const listTaskTypes = (includeInactive = false) =>
  db.taskType.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

export async function saveTaskType(actor: SessionUser, raw: unknown, id?: string) {
  if (!isAdmin(actor)) throw forbidden("Only administrators manage task types.");
  const input = taskTypeSchema.parse(raw);
  const unit = input.unit?.trim() || null;
  const data = { ...input, unit, unitPlural: unit ? input.unitPlural?.trim() || `${unit}s` : null };
  if (id) {
    if (!(await db.taskType.findUnique({ where: { id } }))) throw notFound("Task type");
    const t = await db.taskType.update({ where: { id }, data });
    await audit(actor, "task_type.update", "TaskType", id, { after: data });
    return t;
  }
  const count = await db.taskType.count();
  const t = await db.taskType.create({ data: { ...data, sortOrder: count } });
  await audit(actor, "task_type.create", "TaskType", t.id, { after: data });
  return t;
}
