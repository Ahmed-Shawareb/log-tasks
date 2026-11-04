import { route } from "@/server/api";
import { getFeed } from "@/server/services/social";

type P = { id: string };
export const GET = route<P>(async ({ user, params }) => getFeed(user, params.id));
