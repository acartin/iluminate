import type { Metadata } from "next";
import { LessonList } from "@/components/lesson-list";

export const metadata: Metadata = { title: "Aprender Designer" };

export default function DesignerLearnPage() {
  return (
    <>
      <header className="course-hero page-gutter">
        <span className="section-index">CURSO 01 / DESIGNER</span>
        <h1>Construye el<br />rótulo digital.</h1>
        <p>Del SVG y la escala real al recorrido de cada LED.</p>
      </header>
      <section className="lessons-section page-gutter"><h2 className="sr-only">Lecciones de Designer</h2><LessonList track="Designer" /></section>
    </>
  );
}
