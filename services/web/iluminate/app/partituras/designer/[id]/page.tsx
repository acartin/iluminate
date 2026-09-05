import { notFound, redirect } from "next/navigation";
import { PartituraDesignerStudio } from "@/components/lighting/partitura-workspace";
import { getMenu } from "@/lib/api";
import { getPartitura } from "@/lib/server/partituras";

const currentPath = "/partituras/designer";

export default async function DesignerStudioPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, menu] = await Promise.all([params, getMenu()]);
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === currentPath));
  if (!allowed) {
    const fallbackPath = menu.sections[0]?.items[0]?.href;
    if (fallbackPath) redirect(fallbackPath);
    notFound();
  }

  const partitura = await getPartitura(id);
  if (!partitura) notFound();

  return <PartituraDesignerStudio initialPartitura={partitura} />;
}
