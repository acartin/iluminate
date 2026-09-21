import Link from "next/link";
import type { Project } from "@/content/site";
import { ProjectVisual } from "./project-visual";

export function ProjectCard({ project, priority = false }: { project: Project; priority?: boolean }) {
  return (
    <article className={`project-card ${priority ? "project-card-featured" : ""}`}>
      <Link href={`/projects/${project.slug}`} className="project-card-media" aria-label={`Ver ${project.title}`}>
        <ProjectVisual visual={project.visual} colors={project.colors} />
        <span className="media-action">Ver proyecto <span aria-hidden="true">↗</span></span>
      </Link>
      <div className="project-card-meta">
        <span>{project.index}</span>
        <div>
          <h3><Link href={`/projects/${project.slug}`}>{project.title}</Link></h3>
          <p>{project.kind}</p>
        </div>
        <span>{project.year}</span>
      </div>
    </article>
  );
}
