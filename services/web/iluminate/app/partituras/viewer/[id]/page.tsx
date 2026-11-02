import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/portal/app-shell";
import { OwnerWebViewer } from "@/components/lighting/viewer/owner-web-viewer";
import { getMenu, permissionsByRole } from "@/lib/api";
import { buildOwnerPlayerBundle } from "@/lib/server/owner-player-bundle";
import { getPartituraForClient } from "@/lib/server/partituras";

const designerPath = "/partituras/designer";

export default async function OwnerViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, menu] = await Promise.all([params, getMenu()]);
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === designerPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  const record = await getPartituraForClient(id, menu.tenant.client_id);
  if (!record) notFound();

  let manifestUrl: string | null = null;
  let bundleError: string | null = null;
  try {
    const bundle = buildOwnerPlayerBundle(record);
    const bundleHash = bundle.manifest.bundleHash.replace("sha256:", "");
    manifestUrl = `/api/lighting/partituras/${encodeURIComponent(record.id)}/viewer-bundles/${bundleHash}/manifest.json`;
  } catch (error) {
    bundleError = error instanceof Error ? error.message : "Unable to prepare the Viewer bundle.";
  }

  const permissions = permissionsByRole[menu.user.role];
  const canManageShares = permissions.includes("*") || permissions.includes("lighting:partituras:manage");

  return (
    <AppShell menu={menu} currentPath={designerPath}>
      <OwnerWebViewer
        partituraId={record.id}
        title={record.name}
        manifestUrl={manifestUrl}
        bundleError={bundleError}
        canManageShares={canManageShares}
      />
    </AppShell>
  );
}
