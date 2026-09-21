import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Para fabricantes",
  description: "Una capacidad digital para fabricantes de rótulos, stands y espacios de marca.",
};

export default function ForSignMakersPage() {
  return (
    <>
      <header className="index-hero maker-hero page-gutter">
        <span className="section-index">A— PARA FABRICANTES</span>
        <h1>Tu oficio.<br />Una capacidad nueva.</h1>
        <p>
          Tú conservas la relación con el cliente, el diseño y la fabricación. Iluminate aporta
          el sistema para diseñar, animar y controlar la luz direccionable.
        </p>
      </header>
      <section className="division-section page-gutter dark-section">
        <div>
          <span className="section-index">TÚ APORTAS</span>
          <ul><li>Diseño y fabricación</li><li>Conocimiento del espacio</li><li>Instalación eléctrica</li><li>Relación con el cliente</li></ul>
        </div>
        <div>
          <span className="section-index">ILUMINATE APORTA</span>
          <ul><li>Designer y Animate</li><li>Simulación de escenas</li><li>Controlador y firmware</li><li>Operación remota</li></ul>
        </div>
      </section>
      <section className="maker-value page-gutter">
        <span className="section-index">B— VALOR</span>
        <h2>No vendes más LEDs.<br />Vendes comportamiento.</h2>
        <p>
          Una misma construcción puede tener escenas de bienvenida, campañas, temporadas y
          ambientes distintos. El valor deja de terminar cuando se instala el rótulo.
        </p>
        <Link className="button button-dark" href="/templates">Explorar puntos de partida</Link>
      </section>
    </>
  );
}
