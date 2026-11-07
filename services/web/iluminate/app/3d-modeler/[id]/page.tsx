import { notFound, redirect } from "next/navigation";
import { ThreeDModelerStudio } from "@/components/three-d-modeler/three-d-modeler-studio";
import { getMenu } from "@/lib/api";
import { getProjectForClient } from "@/lib/server/projects";

export default async function ThreeDModelerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const currentPath = "/3d-modeler";
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === currentPath))) {
    const fallback = menu.sections[0]?.items[0]?.href;
    if (fallback) redirect(fallback);
    notFound();
  }
  const project = await getProjectForClient((await params).id, menu.tenant.client_id);
  if (!project) notFound();
  return <ThreeDModelerStudio project={{ id: project.id, name: project.name }} />;
}
