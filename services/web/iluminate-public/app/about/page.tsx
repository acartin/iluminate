import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Estudio", description: "La visión detrás de Iluminate." };

export default function AboutPage() {
  return (
    <>
      <header className="index-hero about-hero page-gutter dark-section">
        <span className="section-index">A— ILUMINATE / ESTUDIO</span>
        <h1>Entre la materia<br />y el movimiento.</h1>
      </header>
      <section className="about-statement page-gutter">
        <p>
          Iluminate nace de una pregunta sencilla: ¿por qué un rótulo digitalmente diseñado
          termina comportándose como un objeto completamente estático?
        </p>
        <div>
          <p>
            Estamos construyendo herramientas especializadas para que fabricantes y diseñadores
            puedan trabajar con luz direccionable desde el inicio del proyecto, no como un efecto
            añadido al final.
          </p>
          <p>
            Los proyectos que ves aquí son estudios propios. Documentan posibilidades, prueban el
            sistema y se convertirán, cuando tenga sentido, en templates reutilizables.
          </p>
        </div>
      </section>
      <section className="about-index page-gutter dark-section">
        <span className="section-index">B— CAMPOS DE TRABAJO</span>
        <p>Rótulos volumétricos</p><p>Identidad espacial</p><p>Coreografía lumínica</p><p>Herramientas creativas</p><p>Sistemas de control</p>
      </section>
      <section className="simple-cta page-gutter">
        <h2>Observa lo que<br />estamos construyendo.</h2>
        <Link className="button button-dark" href="/projects">Ver proyectos</Link>
      </section>
    </>
  );
}
