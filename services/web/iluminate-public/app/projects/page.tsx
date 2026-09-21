import type { Metadata } from "next";
import { ProjectCard } from "@/components/project-card";
import { projects } from "@/content/site";

export const metadata: Metadata = {
  title: "Proyectos",
  description: "Estudios conceptuales de rótulos 3D, luz direccionable y movimiento creados por Iluminate.",
};

export default function ProjectsPage() {
  return (
    <>
      <header className="index-hero page-gutter">
        <span className="section-index">A— ARCHIVO / {projects.length.toString().padStart(2, "0")}</span>
        <h1>Proyectos<br />de luz.</h1>
        <p>
          Estudios conceptuales creados por Iluminate para explorar cómo forma, espacio y
          tiempo pueden convivir dentro de un rótulo.
        </p>
      </header>
      <section className="archive-grid page-gutter">
        {projects.map((project) => <ProjectCard key={project.slug} project={project} />)}
      </section>
    </>
  );
}
