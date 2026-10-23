import { requirePageUser } from "@/server/session";
import { ProjectDetailClient } from "./project-detail-client";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser();
  const { id } = await params;
  return <ProjectDetailClient id={id} />;
}
