import type { Metadata } from "next";
import Link from "next/link";
import { ProjectVisual } from "@/components/project-visual";
import { templates } from "@/content/site";

export const metadata: Metadata = {
  title: "Templates",
  description: "Puntos de partida editables para crear proyectos de iluminación con Iluminate.",
};

export default function TemplatesPage() {
  return (
    <>
      <header className="index-hero page-gutter">
        <span className="section-index">A— BIBLIOTECA / BASES EDITABLES</span>
        <h1>Ideas listas<br />para evolucionar.</h1>
        <p>
          Un template conserva la lógica de una coreografía, no la forma de tu proyecto.
          Elige una base, llévala al Designer y hazla propia.
        </p>
      </header>
      <section className="template-list page-gutter">
        {templates.map((template) => (
          <article key={template.slug} className="template-row">
            <Link href={`/templates/${template.slug}`} className="template-media">
              <ProjectVisual visual={template.visual} colors={template.colors} />
            </Link>
            <div className="template-copy">
              <span className="section-index">{template.index} / {template.format}</span>
              <h2><Link href={`/templates/${template.slug}`}>{template.title}</Link></h2>
              <p>{template.description}</p>
              <Link className="text-link" href={`/templates/${template.slug}`}>Explorar template ↗</Link>
            </div>
          </article>
        ))}
      </section>
      <aside className="honesty-note page-gutter">
        <span>NOTA</span>
        <p>
          Esta biblioteca empieza pequeña a propósito. Cada template será una base probada y
          documentada, no un archivo decorativo más.
        </p>
      </aside>
    </>
  );
}
