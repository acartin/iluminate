import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSceneShareViewer } from "@/lib/server/scene-share-viewer";

type ReviewPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ReviewPageProps): Promise<Metadata> {
  const share = await getSceneShareViewer((await params).slug);
  return {
    title: share ? `${share.title} · Revisión Iluminate` : "Escena no disponible",
    robots: { index: false, follow: false }
  };
}

export default async function SceneReviewPage({ params }: ReviewPageProps) {
  const share = await getSceneShareViewer((await params).slug);
  if (!share) notFound();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100 sm:p-8">
      <article className="w-full max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Revisión privada · Iluminate</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">{share.title}</h1>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">{share.policy}</span>
        </header>
        {share.status === "ready" && share.videoUrl && share.posterUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-black shadow-2xl" style={{ aspectRatio: `${share.width ?? 16} / ${share.height ?? 9}` }}>
            <video className="h-full w-full object-contain" controls loop playsInline preload="metadata" poster={share.posterUrl} src={share.videoUrl} />
          </div>
        ) : (
          <div className="flex min-h-[45vh] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
            <div className="max-w-lg">
              <p className="text-lg font-medium">{share.status === "failed" ? "No fue posible generar el video" : "Estamos generando el video"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {share.status === "failed" ? "El propietario puede reintentar la publicación desde Iluminate." : "Este enlace se activará automáticamente cuando termine el render. Intenta recargarlo en unos minutos."}
              </p>
            </div>
          </div>
        )}
        <footer className="border-t border-slate-800 pt-4 text-sm text-slate-400">
          Enlace no indexado y revocable. No lo reenvíes sin autorización del propietario.
        </footer>
      </article>
    </main>
  );
}
