import { notFound, redirect } from "next/navigation";
import { ProjectsWorkbench } from "@/components/lighting/projects-workbench";
import { AppShell } from "@/components/portal/app-shell";
import { getMenu } from "@/lib/api";

export default async function ProjectsPage() { const menu = await getMenu(); const currentPath = "/projects"; if (!menu.sections.some((section) => section.items.some((item) => item.href === currentPath))) { const fallback = menu.sections[0]?.items[0]?.href; if (fallback) redirect(fallback); notFound(); } return <AppShell menu={menu} currentPath={currentPath}><ProjectsWorkbench /></AppShell>; }
