import type { Metadata } from "next";
import { LessonList } from "@/components/lesson-list";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Aprender Animate",
  description: "Próximas lecciones para componer escenas, efectos, paletas, ritmo y transiciones en Iluminate Animate.",
  path: "/learn/animate",
});

export default function AnimateLearnPage() {
  return (
    <>
      <header className="course-hero page-gutter">
        <span className="section-index">CURSO 02 / ANIMATE</span>
        <h1>Compón el<br />comportamiento.</h1>
        <p>De una escena en blanco a una coreografía legible y expresiva.</p>
      </header>
      <section className="lessons-section page-gutter"><h2 className="sr-only">Lecciones de Animate</h2><LessonList track="Animate" /></section>
    </>
  );
}
