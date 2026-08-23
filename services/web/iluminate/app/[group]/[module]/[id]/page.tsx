import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/portal/app-shell";
import { AgentWorkspace } from "@/components/workspace/agent-workspace";
import { TenantWorkspace } from "@/components/workspace/tenant-workspace";
import { getMenu, getWorkspace } from "@/lib/api";
import { feedbackFromSearchParams } from "@/lib/feedback";

function workspaceEndpoint(group: string, module: string, id: string) {
  if (group === "settings" && module === "tenants") {
    return `/settings/tenants/${encodeURIComponent(id)}/workspace`;
  }
  if (group === "settings" && module === "agents") {
    return `/settings/agents/${encodeURIComponent(id)}/workspace`;
  }

  return null;
}

export default async function WorkspaceRoute({
  params,
  searchParams
}: {
  params: Promise<{ group: string; module: string; id: string }>;
  searchParams?: Promise<{ contact_id?: string; feedback?: string; message?: string; tab?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const currentPath = `/${resolvedParams.group}/${resolvedParams.module}`;
  const endpoint = workspaceEndpoint(resolvedParams.group, resolvedParams.module, resolvedParams.id);
  if (!endpoint) notFound();

  const menu = await getMenu();
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === currentPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  const payload = await getWorkspace(endpoint);

  return (
    <AppShell menu={menu} currentPath={currentPath}>
      {resolvedParams.module === "agents" ? (
        <AgentWorkspace
          payload={payload}
          initialTab={resolvedSearchParams?.tab}
          feedback={feedbackFromSearchParams(resolvedSearchParams)}
        />
      ) : (
        <TenantWorkspace
          payload={payload}
          initialTab={resolvedSearchParams?.tab}
          contactFilter={resolvedSearchParams?.contact_id}
          feedback={feedbackFromSearchParams(resolvedSearchParams)}
        />
      )}
    </AppShell>
  );
}
