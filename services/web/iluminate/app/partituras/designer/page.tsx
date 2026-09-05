import { notFound, redirect } from "next/navigation";
import { PartituraDesignerWorkbench } from "@/components/lighting/partitura-designer-workbench";
import { AppShell } from "@/components/portal/app-shell";
import { getMenu } from "@/lib/api";

export default async function DesignerPage() {
  const currentPath = "/partituras/designer";
  const menu = await getMenu();
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === currentPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  return (
    <AppShell menu={menu} currentPath={currentPath}>
      <PartituraDesignerWorkbench />
    </AppShell>
  );
}
