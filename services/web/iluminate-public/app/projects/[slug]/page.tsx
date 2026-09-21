import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectPlayer } from "@/components/project-player";
import { ProjectVisual } from "@/components/project-visual";
import { appUrl, projects } from "@/content/site";

type ProjectPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  if (!project) notFound();
  const currentIndex = projects.findIndex((item) => item.slug === slug);
  const nextProject = projects[(currentIndex + 1) % projects.length];

  return (
    <article className="project-page">
      <header className="project-hero dark-section page-gutter">
        <div className="project-hero-copy">
          <span className="section-index">{project.index} / {project.location}</span>
          <h1>{project.title}</h1>
          <p>{project.summary}</p>
        </div>
        <div className="project-hero-visual">
          <ProjectVisual visual={project.visual} colors={project.colors} />
        </div>
        <div className="project-hero-meta">
          <span>{project.kind}</span><span>{project.year}</span>
        </div>
      </header>

      <section className="project-intro page-gutter">
        <span className="section-index">A— CONCEPTO</span>
        <p>{project.statement}</p>
        <dl>
          {project.specs.map(([term, value]) => (
            <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </section>

      <section className="interactive-section page-gutter">
        <div className="interactive-heading">
          <span className="section-index">B— INTERACCIÓN</span>
          <h2>Prueba la<br />atmósfera.</h2>
          <p>
            Cambia la paleta y el ritmo de esta vista conceptual. El configurador de producción
            completo vive dentro de Designer.
          </p>
        </div>
        <ProjectPlayer visual={project.visual} />
      </section>

      {project.templateSlug && (
        <section className="template-callout page-gutter">
          <span className="section-index">C— TEMPLATE DISPONIBLE</span>
          <h2>No empieces<br />desde cero.</h2>
          <p>Usa la estructura de este estudio como punto de partida y adáptala a tu geometría.</p>
          <div>
            <Link className="button button-dark" href={`/templates/${project.templateSlug}`}>Ver el template</Link>
            <a className="text-link" href={appUrl}>Abrir Designer ↗</a>
          </div>
        </section>
      )}

      <Link className="next-project dark-section page-gutter" href={`/projects/${nextProject.slug}`}>
        <span className="section-index">SIGUIENTE PROYECTO / {nextProject.index}</span>
        <strong>{nextProject.title}</strong>
        <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
