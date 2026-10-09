import { redirect } from "next/navigation";

export default async function PartituraWorkspacePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/partituras/designer/${encodeURIComponent(id)}`);
}
