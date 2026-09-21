import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectPlayer } from "@/components/project-player";
import { appUrl, templates } from "@/content/site";

type TemplatePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return templates.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
  const { slug } = await params;
  const template = templates.find((item) => item.slug === slug);
  return template ? { title: template.title, description: template.description } : {};
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { slug } = await params;
  const template = templates.find((item) => item.slug === slug);
  if (!template) notFound();

  return (
    <article className="template-detail">
      <header className="detail-title page-gutter">
        <span className="section-index">{template.index} / TEMPLATE</span>
        <h1>{template.title}</h1>
        <p>{template.description}</p>
      </header>
      <div className="page-gutter"><ProjectPlayer visual={template.visual} /></div>
      <section className="template-includes page-gutter">
        <span className="section-index">INCLUYE</span>
        <div className="include-grid">
          <div><strong>03</strong><span>Escenas base</span></div>
          <div><strong>03</strong><span>Paletas iniciales</span></div>
          <div><strong>100%</strong><span>Editable</span></div>
        </div>
        <p>
          Al usar este template se creará una copia privada en tu cuenta. La geometría, el
          cableado y la configuración del controlador deberán adaptarse a tu proyecto real.
        </p>
        <a className="button button-dark" href={`${appUrl}/?template=${template.slug}`}>Usar este template ↗</a>
        <Link className="text-link" href={`/projects/${template.projectSlug}`}>Ver proyecto de origen</Link>
      </section>
    </article>
  );
}
