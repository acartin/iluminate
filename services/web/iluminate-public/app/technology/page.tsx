import type { Metadata } from "next";
import { appUrl } from "@/content/site";

export const metadata: Metadata = {
  title: "Tecnología",
  description: "El sistema Iluminate conecta diseño físico, coreografía, simulación y control.",
};

export default function TechnologyPage() {
  return (
    <>
      <header className="index-hero technology-hero page-gutter dark-section">
        <span className="section-index">A— TECNOLOGÍA / SISTEMA</span>
        <h1>Una partitura<br />para la luz.</h1>
        <p>
          El rótulo define el espacio. La partitura define cómo se comporta. El controlador
          conserva y reproduce cada escena sin depender de una transmisión continua.
        </p>
      </header>
      <section className="system-map page-gutter">
        <span className="system-line" aria-hidden="true" />
        <article><span>01</span><h2>Designer</h2><p>Modela la geometría física, zonas, recorridos LED y conexiones reales.</p></article>
        <article><span>02</span><h2>Animate</h2><p>Organiza efectos, objetivos y tiempo en escenas reproducibles.</p></article>
        <article><span>03</span><h2>Simulate</h2><p>Anticipa el comportamiento de los píxeles antes de fabricar e instalar.</p></article>
        <article><span>04</span><h2>Control</h2><p>Ejecuta partituras validadas en hardware dedicado y cambia escenas remotamente.</p></article>
      </section>
      <section className="principles-section page-gutter dark-section">
        <span className="section-index">B— PRINCIPIOS</span>
        <div className="principle-list">
          <article><span>01</span><h3>La forma sigue siendo física.</h3><p>Escala, cableado, densidad y dirección importan. El software trabaja con esas restricciones, no las oculta.</p></article>
          <article><span>02</span><h3>La luz es una composición.</h3><p>Una escena coordina zonas completas; no es una lista desconectada de colores y efectos.</p></article>
          <article><span>03</span><h3>La instalación debe ser autónoma.</h3><p>Una interrupción de internet no debería apagar la experiencia instalada.</p></article>
        </div>
        <a className="button button-light" href={appUrl}>Abrir Designer ↗</a>
      </section>
    </>
  );
}
