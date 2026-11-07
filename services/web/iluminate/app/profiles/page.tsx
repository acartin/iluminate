import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/portal/app-shell";
import { NewProfileButton } from "@/components/three-d-modeler/new-profile-button";
import { ProfileThumbnail } from "@/components/three-d-modeler/profile-thumbnail";
import { Badge } from "@/components/ui/badge";
import { getMenu } from "@/lib/api";
import { listThreeDProfiles } from "@/lib/server/three-d-profiles";

export default async function ProfilesPage() {
  const currentPath = "/profiles";
  const menu = await getMenu();
  if (menu.user.role !== "system-admin" || !menu.sections.some((section) => section.items.some((item) => item.href === currentPath))) {
    const fallback = menu.sections[0]?.items[0]?.href;
    if (fallback) redirect(fallback);
    notFound();
  }
  const profiles = await listThreeDProfiles();
  return <AppShell menu={menu} currentPath={currentPath}><section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><div className="text-meta font-medium uppercase text-muted-foreground">Auth · Global catalog</div><h1 className="mt-1 text-page-title font-semibold">Profiles</h1><p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">Internal library of cross-sections shared by all projects. Open a card to edit only the Profile geometry.</p></div><NewProfileButton /></div>{profiles.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{profiles.map((profile) => <Link key={profile.id} href={`/profiles/${profile.id}`} className="group overflow-hidden rounded-xl border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"><div className="h-48 border-b bg-surface-2 p-5"><ProfileThumbnail document={profile.document} /></div><div className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><div className="truncate font-medium">{profile.name}</div><div className="mt-1 line-clamp-2 min-h-10 text-body-sm text-muted-foreground">{profile.description || "No description"}</div><div className="mt-3 flex items-center gap-2"><Badge>{profile.status}</Badge><span className="text-meta text-muted-foreground">v{profile.revision} · {profile.document.profile.contours.length} contour(s)</span></div></div><ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" /></div></Link>)}</div> : <div className="rounded-xl border border-dashed bg-surface px-6 py-16 text-center"><div className="font-medium">No Profiles yet</div><p className="mt-1 text-body-sm text-muted-foreground">Create the first global Profile to open the editor.</p><div className="mt-4 flex justify-center"><NewProfileButton /></div></div>}</section></AppShell>;
}
