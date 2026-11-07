import Link from "next/link";
import { Box, ChevronRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/portal/app-shell";
import { Badge } from "@/components/ui/badge";
import { getMenu } from "@/lib/api";
import { listProjects } from "@/lib/server/projects";

export default async function ThreeDModelerPage() {
  const currentPath = "/3d-modeler";
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === currentPath))) {
    const fallback = menu.sections[0]?.items[0]?.href;
    if (fallback) redirect(fallback);
    notFound();
  }
  const projects = await listProjects(menu.tenant.client_id);
  return <AppShell menu={menu} currentPath={currentPath}>
    <section className="space-y-5">
      <div><div className="text-meta font-medium uppercase text-muted-foreground">Fabrication</div><h1 className="mt-1 text-page-title font-semibold">3D Modeler</h1><p className="mt-1 text-body-sm text-muted-foreground">Independent vector-profile and sweep workspace. Select a project to begin.</p></div>
      <div className="overflow-hidden rounded-xl border bg-surface">
        {projects.length ? projects.map((project) => <Link key={project.id} href={`/3d-modeler/${project.id}`} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0 hover:bg-surface-hover">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--purple-bg)] text-[var(--purple-text)]"><Box className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-medium">{project.name}</span><span className="block truncate text-body-sm text-muted-foreground">{project.description || "No project description"}</span></span>
          <Badge>{project.status}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>) : <div className="p-8 text-center text-body-sm text-muted-foreground">Create a project before opening the 3D Modeler.</div>}
      </div>
    </section>
  </AppShell>;
}
