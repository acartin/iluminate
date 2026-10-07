import type { Metadata } from "next";
import { notFound } from "next/navigation";

type SharePageProps = { params: Promise<{ slug: string }> };

type PublicShareManifest = {
  version: "scene-share.v1";
  slug: string;
  title: string;
  author?: string;
  description?: string;
  policy: "unlisted" | "public";
  videoUrl: string;
  posterUrl: string;
  width: number;
  height: number;
  durationMs: number;
  interactiveUrl?: string;
};

export const revalidate = 300;

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const manifest = await loadManifest((await params).slug);
  if (!manifest) return { title: "Escena no disponible", robots: { index: false, follow: false } };
  return {
    title: manifest.title,
    description: manifest.description ?? "Escena de luz creada con Iluminate.",
    robots: manifest.policy === "public" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "video.other",
      title: manifest.title,
      description: manifest.description,
      images: [{ url: manifest.posterUrl, width: manifest.width, height: manifest.height }],
      videos: [{ url: manifest.videoUrl, width: manifest.width, height: manifest.height }]
    }
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const manifest = await loadManifest((await params).slug);
  if (!manifest) notFound();
  return (
    <article className="share-scene dark-section page-gutter">
      <header className="share-scene-heading">
        <span className="section-index">ESCENA ILUMINATE</span>
        <h1>{manifest.title}</h1>
        {manifest.author ? <p>Por {manifest.author}</p> : null}
      </header>
      <div className="share-video-frame" style={{ aspectRatio: `${manifest.width} / ${manifest.height}` }}>
        <video
          controls
          loop
          playsInline
          preload="metadata"
          poster={manifest.posterUrl}
          src={manifest.videoUrl}
          aria-label={`Video de ${manifest.title}`}
        />
      </div>
      <footer className="share-scene-footer">
        <p>{manifest.description ?? "Una partitura de luz reproducida como video para compartir sin cargar el runtime interactivo."}</p>
        {manifest.interactiveUrl ? <a className="button button-light" href={manifest.interactiveUrl}>Abrir interactivo</a> : null}
      </footer>
    </article>
  );
}

async function loadManifest(slug: string): Promise<PublicShareManifest | null> {
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(slug)) return null;
  const origin = process.env.ILUMINATE_PUBLIC_MEDIA_ORIGIN?.replace(/\/$/, "");
  if (!origin) return null;
  const response = await fetch(`${origin}/shares/${slug}/manifest.json`, { next: { revalidate } });
  if (!response.ok) return null;
  const manifest = await response.json() as PublicShareManifest;
  if (manifest.version !== "scene-share.v1" || manifest.slug !== slug || !["unlisted", "public"].includes(manifest.policy)) return null;
  return manifest;
}
