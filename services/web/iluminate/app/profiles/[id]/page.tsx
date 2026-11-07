import { notFound, redirect } from "next/navigation";
import { ThreeDModelerStudio } from "@/components/three-d-modeler/three-d-modeler-studio";
import { getMenu } from "@/lib/api";
import { getThreeDProfile } from "@/lib/server/three-d-profiles";

export default async function ProfileEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  if (menu.user.role !== "system-admin" || !menu.sections.some((section) => section.items.some((item) => item.href === "/profiles"))) redirect("/profiles");
  const profile = await getThreeDProfile((await params).id);
  if (!profile) notFound();
  return <ThreeDModelerStudio project={{ id: "", name: profile.name }} catalogProfile={{ id: profile.id, name: profile.name }} />;
}
