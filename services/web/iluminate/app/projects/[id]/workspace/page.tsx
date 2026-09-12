import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/lighting/projects-workbench";
import { AppShell } from "@/components/portal/app-shell";
import { getMenu } from "@/lib/api";
import { listProjectPartituras } from "@/lib/server/partituras";
import { getProject, listProjectAssets } from "@/lib/server/projects";

export default async function ProjectWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) { const [{ id }, query] = await Promise.all([params, searchParams]); const [menu, project] = await Promise.all([getMenu(), getProject(id)]); if (!project) notFound(); const [partituras, assets] = await Promise.all([listProjectPartituras(id), listProjectAssets(id)]); return <AppShell menu={menu} currentPath="/projects"><ProjectWorkspace initialProject={project} initialPartituras={partituras} initialAssets={assets} initialTab={query.tab} /></AppShell>; }
