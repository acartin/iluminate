import type { Metadata } from "next";
import Link from "next/link";
import { ProjectPlayer } from "@/components/project-player";
import { appStartUrl } from "@/content/site";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Simulador de rótulos LED",
  description:
    "Explora una vista conceptual de iluminación direccionable y prueba cómo cambian el color, el ritmo y el movimiento de un rótulo.",
  path: "/simulator",
});

export default function SimulatorPage() {
  return (
    <>
      <header className="index-hero simulator-hero page-gutter dark-section">
        <span className="section-index">A— SIMULADOR / PREVIEW PÚBLICO</span>
        <h1>Prueba la luz<br />antes de construir.</h1>
        <p>
          Explora cómo una paleta y un ritmo pueden transformar la lectura de un rótulo.
          Esta es una vista conceptual; el diseño completo vive dentro de Iluminate.
        </p>
      </header>

      <section className="interactive-section page-gutter" aria-labelledby="simulator-preview-title">
        <div className="interactive-heading">
          <span className="section-index">B— INTERACCIÓN</span>
          <h2 id="simulator-preview-title">Cambia la<br />atmósfera.</h2>
          <p>
            Reproduce o pausa la escena, cambia la paleta y ajusta su velocidad. Próximamente
            podrás explorar más rótulos y comportamientos publicados desde Iluminate.
          </p>
        </div>
        <ProjectPlayer visual="signal" />
      </section>

      <section className="track-selector page-gutter" aria-label="Siguientes pasos">
        <Link href="/projects">
          <span>01</span><strong>Proyectos</strong><p>Observa estudios de luz aplicados a formas y espacios distintos.</p><i>↗</i>
        </Link>
        <Link href="/templates">
          <span>02</span><strong>Templates</strong><p>Encuentra puntos de partida preparados para evolucionar.</p><i>↗</i>
        </Link>
      </section>

      <section className="simple-cta page-gutter">
        <span className="section-index">C— PRÓXIMAMENTE</span>
        <h2>De una prueba visual<br />a tu propio rótulo.</h2>
        <a className="button button-dark" href={appStartUrl}>Abrir Designer ↗</a>
      </section>
    </>
  );
}
