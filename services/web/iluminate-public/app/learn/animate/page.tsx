import type { Metadata } from "next";
import { LessonList } from "@/components/lesson-list";

export const metadata: Metadata = { title: "Aprender Animate" };

export default function AnimateLearnPage() {
  return (
    <>
      <header className="course-hero page-gutter">
        <span className="section-index">CURSO 02 / ANIMATE</span>
        <h1>Compón el<br />comportamiento.</h1>
        <p>De una escena en blanco a una coreografía legible y expresiva.</p>
      </header>
      <section className="lessons-section page-gutter"><LessonList track="Animate" /></section>
    </>
  );
}
