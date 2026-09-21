import Link from "next/link";
import { appUrl } from "@/content/site";
import { BrandMark } from "./brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-lead">
        <BrandMark />
        <p>Construir la forma.<br />Componer la luz.</p>
      </div>
      <div className="footer-grid">
        <div>
          <span className="eyebrow">Explorar</span>
          <Link href="/projects">Proyectos</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/learn">Aprender</Link>
        </div>
        <div>
          <span className="eyebrow">Iluminate</span>
          <Link href="/technology">Tecnología</Link>
          <Link href="/for-sign-makers">Para fabricantes</Link>
          <Link href="/about">Estudio</Link>
        </div>
        <div>
          <span className="eyebrow">Plataforma</span>
          <a href={appUrl}>Abrir Designer ↗</a>
          <a href={appUrl}>Iniciar sesión ↗</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Iluminate</span>
        <span>iluminate.space</span>
        <span>San José, Costa Rica</span>
      </div>
    </footer>
  );
}
