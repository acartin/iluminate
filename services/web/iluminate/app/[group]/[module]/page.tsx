import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/portal/app-shell";
import { ModuleView } from "@/components/portal/module-view";
import { getMenu, getModule } from "@/lib/api";
import { feedbackFromSearchParams } from "@/lib/feedback";
import { moduleEndpointByPath } from "@/lib/modules";

export default async function ModulePage({
  params,
  searchParams
}: {
  params: Promise<{ group: string; module: string }>;
  searchParams?: Promise<{ feedback?: string; message?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const currentPath = `/${resolvedParams.group}/${resolvedParams.module}`;
  const endpoint = moduleEndpointByPath[currentPath];
  if (!endpoint) notFound();

  const menu = await getMenu();
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === currentPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  const payload = await getModule(endpoint);

  return (
    <AppShell menu={menu} currentPath={currentPath}>
      <ModuleView payload={payload} feedback={feedbackFromSearchParams(resolvedSearchParams)} />
    </AppShell>
  );
}
