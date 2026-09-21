import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found page-gutter dark-section">
      <span className="section-index">404 / SIN SEÑAL</span>
      <h1>Esta luz<br />no está conectada.</h1>
      <Link className="button button-light" href="/">Volver al inicio</Link>
    </section>
  );
}
