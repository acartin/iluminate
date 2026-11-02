import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { WebViewerSurface } from "@/components/lighting/viewer/web-viewer-surface";
import { ViewerShareMenu } from "@/components/lighting/viewer/viewer-share-menu";
import { getStandaloneViewerLink } from "@/lib/server/standalone-viewer-link";

type StandaloneViewerPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: StandaloneViewerPageProps): Promise<Metadata> {
  const share = await getStandaloneViewerLink((await params).slug);
  return {
    title: share ? `${share.title} · Iluminate Viewer` : "Viewer unavailable",
    robots: { index: false, follow: false }
  };
}

export default async function StandaloneViewerPage({ params }: StandaloneViewerPageProps) {
  const { slug } = await params;
  const share = await getStandaloneViewerLink(slug);
  if (!share) notFound();
  return (
    <main className="h-dvh min-h-[420px] overflow-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-2 p-2 sm:gap-3 sm:p-4 lg:p-5">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 sm:gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <a href="https://iluminate.space" aria-label="Visit iluminate.space" title="Visit iluminate.space" className="flex shrink-0 items-center gap-2.5 rounded-md text-[#f4f1ea] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <Image src="/iluminate-space-icon.svg" width={44} height={44} alt="" className="h-9 w-9 rounded-lg sm:h-11 sm:w-11" priority />
              <span className="text-[21px] font-extrabold tracking-[-0.075em] sm:text-[25px]">iluminate</span>
            </a>
            <div className="min-w-0 border-l border-slate-700 pl-3 sm:pl-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[10px] sm:tracking-[0.22em]">Web Viewer</p>
              <h1 className="mt-0.5 truncate text-base font-semibold sm:text-xl lg:text-2xl">{share.title}</h1>
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <ViewerShareMenu title={share.title} />
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">{share.policy}</span>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <WebViewerSurface manifestUrl={`/api/viewer/${encodeURIComponent(slug)}/bundle/manifest.json`} title={share.title} fillViewport />
        </div>
      </div>
    </main>
  );
}
