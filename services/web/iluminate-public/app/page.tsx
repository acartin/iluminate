import Link from "next/link";
import { HeroStage } from "@/components/hero-stage";
import { ProjectCard } from "@/components/project-card";
import { Reveal } from "@/components/reveal";
import { appUrl, projects } from "@/content/site";

export default function HomePage() {
  return (
    <>
      <section className="hero hero-light">
        <HeroStage />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="hero-kicker">Coreografía para rótulos físicos</p>
          <h1>Rótulos con horario<br /><span className="hero-line-nowrap">y&nbsp;temporada.</span></h1>
          <div className="hero-bottom">
            <p>
              Programa cuándo enciende, cómo se mueve y qué escena acompaña cada
              momento del año.
            </p>
            <Link className="text-link" href="/projects/signal-no-01">
              Explorar proyectos <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
        <span className="hero-index">A—01 / ILUMINATE ORIGINAL</span>
        <span className="scroll-cue">Desplazar ↓</span>
      </section>

      <section className="manifesto page-gutter">
        <Reveal>
          <span className="section-index">A—02 / PROPÓSITO</span>
          <p className="manifesto-copy">
            No hacemos que un rótulo <em>brille más.</em><br />
            Hacemos que pueda <strong>expresarse.</strong>
          </p>
          <div className="manifesto-note">
            <p>
              Del trazado físico a la animación final, Iluminate conecta el oficio de fabricar
              con las posibilidades de la luz digital.
            </p>
            <Link className="text-link" href="/technology">Conocer el sistema ↗</Link>
          </div>
        </Reveal>
      </section>

      <section className="projects-section page-gutter">
        <div className="section-heading">
          <span className="section-index">B— PROYECTOS SELECCIONADOS</span>
          <h2>Estudios en<br />luz y materia.</h2>
          <Link className="text-link" href="/projects">Ver todos los proyectos ↗</Link>
        </div>
        <div className="project-grid">
          {projects.slice(0, 3).map((project, index) => (
            <Reveal key={project.slug} className={index === 0 ? "grid-span-2" : ""}>
              <ProjectCard project={project} priority={index === 0} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="process-section dark-section page-gutter">
        <div className="section-heading section-heading-light">
          <span className="section-index">C— SISTEMA</span>
          <h2>Una idea.<br />Tres actos.</h2>
        </div>
        <div className="process-grid">
          <article>
            <span>01</span>
            <h3>Diseñar</h3>
            <p>Dibuja la pieza real, sus zonas y el recorrido físico de cada string LED.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Animar</h3>
            <p>Compón escenas, tiempos, paletas y efectos sobre la geometría verdadera.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Materializar</h3>
            <p>Simula antes de fabricar y ejecuta la partitura en un controlador dedicado.</p>
          </article>
        </div>
        <Link className="large-action" href="/technology">
          <span>Descubrir la tecnología</span><span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="audience-section page-gutter">
        <Reveal>
          <span className="section-index">D— PARA QUIÉN</span>
          <h2>Una nueva capacidad<br />para quienes ya saben fabricar.</h2>
          <div className="audience-content">
            <p>
              Iluminate está pensado para fabricantes de rótulos, estudios espaciales y
              equipos de producción que quieren ofrecer movimiento, control y nuevas escenas
              sin convertirse en una empresa de software.
            </p>
            <Link className="text-link" href="/for-sign-makers">Iluminate para fabricantes ↗</Link>
          </div>
        </Reveal>
      </section>

      <section className="closing-cta dark-section page-gutter">
        <span className="section-index">E— EMPEZAR</span>
        <h2>De una forma estática<br />a una experiencia viva.</h2>
        <div className="closing-actions">
          <Link className="button button-light" href="/templates">Explorar templates</Link>
          <a className="button button-outline" href={appUrl}>Abrir Designer ↗</a>
        </div>
      </section>
    </>
  );
}
