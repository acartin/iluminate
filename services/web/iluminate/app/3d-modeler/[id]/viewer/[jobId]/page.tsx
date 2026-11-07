import { notFound, redirect } from "next/navigation";
import { ThreeDModelViewer } from "@/components/three-d-modeler/three-d-model-viewer";
import { getMenu } from "@/lib/api";
import { getPool } from "@/lib/server/postgres";
import { getProjectForClient } from "@/lib/server/projects";

export default async function ThreeDModelViewerPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const values = await params;
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) {
    const fallback = menu.sections[0]?.items[0]?.href;
    if (fallback) redirect(fallback);
    notFound();
  }
  const project = await getProjectForClient(values.id, menu.tenant.client_id);
  if (!project || !/^\d+$/.test(values.jobId)) notFound();
  const result = await getPool().query("select 1 from iluminate.three_d_model_jobs where id = $1 and client_id = $2 and project_id = $3 and status = 'succeeded'", [values.jobId, project.clientId, project.id]);
  if (!result.rowCount) notFound();
  return <ThreeDModelViewer project={{ id: project.id, name: project.name }} resultId={values.jobId} />;
}
