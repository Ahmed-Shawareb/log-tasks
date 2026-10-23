import { db } from "@/lib/db";
import { route } from "@/server/api";
import { publicUserSelect, updateUser } from "@/server/services/org";

export const GET = route(async ({ user }) => {
  const [profile, timer] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUserSelect }),
    db.timeEntry.findFirst({ where: { userId: user.id, endedAt: null }, include: { task: { select: { id: true, number: true, title: true } } } }),
  ]);
  return { user: profile, timer };
});

export const PATCH = route(async ({ req, user }) => updateUser(user, user.id, await req.json()));
