import { requirePageUser } from "@/server/session";
import { ProjectsClient } from "./projects-client";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requirePageUser();
  return <ProjectsClient />;
}
