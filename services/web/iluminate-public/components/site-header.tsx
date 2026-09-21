import Link from "next/link";
import { appUrl } from "@/content/site";
import { Brand } from "./brand";

const navigation = [
  ["Proyectos", "/projects"],
  ["Templates", "/templates"],
  ["Aprender", "/learn"],
  ["Tecnología", "/technology"],
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <Brand />
      <nav className="desktop-nav" aria-label="Navegación principal">
        {navigation.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <a className="header-access" href={appUrl}>
        Abrir Designer <span aria-hidden="true">↗</span>
      </a>
      <details className="mobile-menu">
        <summary aria-label="Abrir navegación">Menú</summary>
        <div className="mobile-menu-panel">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <Link href="/for-sign-makers">Para fabricantes</Link>
          <Link href="/about">Estudio</Link>
          <a href={appUrl}>Abrir Designer ↗</a>
        </div>
      </details>
    </header>
  );
}
