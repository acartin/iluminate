import { notFound, redirect } from "next/navigation";
import { PartituraGeneratorWorkbench } from "@/components/lighting/partitura-generator-workbench";
import { AppShell } from "@/components/portal/app-shell";
import { getMenu } from "@/lib/api";

export default async function PartituraGeneratorPage() {
  const currentPath = "/partituras/generator";
  const menu = await getMenu();
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === currentPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  return (
    <AppShell menu={menu} currentPath={currentPath}>
      <PartituraGeneratorWorkbench />
    </AppShell>
  );
}

