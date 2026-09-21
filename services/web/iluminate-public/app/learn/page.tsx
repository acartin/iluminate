import type { Metadata } from "next";
import Link from "next/link";
import { LessonList } from "@/components/lesson-list";

export const metadata: Metadata = {
  title: "Aprender",
  description: "Tutoriales de Designer y Animate para llevar una idea de la geometría a la luz.",
};

export default function LearnPage() {
  return (
    <>
      <header className="index-hero learn-hero page-gutter dark-section">
        <span className="section-index">A— APRENDER</span>
        <h1>Del primer trazo<br />a la primera escena.</h1>
        <p>
          Tutoriales directos para diseñar instalaciones reales y darles movimiento. El contenido
          se publicará en el canal oficial de Iluminate en YouTube.
        </p>
      </header>
      <section className="track-selector page-gutter">
        <Link href="/learn/designer">
          <span>01</span><strong>Designer</strong><p>Geometría, zonas, strings, controladores y compilación.</p><i>↗</i>
        </Link>
        <Link href="/learn/animate">
          <span>02</span><strong>Animate</strong><p>Escenas, clips, efectos, color, ritmo y preview.</p><i>↗</i>
        </Link>
      </section>
      <section className="lessons-section page-gutter">
        <div className="section-heading compact-heading">
          <span className="section-index">PRÓXIMAS LECCIONES</span>
          <h2>Empieza por aquí.</h2>
        </div>
        <LessonList />
      </section>
    </>
  );
}
