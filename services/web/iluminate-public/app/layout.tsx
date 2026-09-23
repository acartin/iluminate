import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-brand",
});

const siteUrl = process.env.ILUMINATE_PUBLIC_SITE_URL ?? "https://iluminate.space";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Iluminate — Rótulos que se mueven con luz",
    template: "%s — Iluminate",
  },
  description:
    "Diseña, anima y controla rótulos 3D con iluminación direccionable. Explora proyectos, templates y el sistema creativo de Iluminate.",
  applicationName: "Iluminate",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CR",
    siteName: "Iluminate",
    title: "Iluminate — Rótulos que se mueven con luz",
    description: "Una plataforma para diseñar la forma y componer la luz.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Iluminate",
    description: "Rótulos tridimensionales con luz coreografiada.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={archivo.variable}>
      <body>
        <a className="skip-link" href="#content">Saltar al contenido</a>
        <SiteHeader />
        <main id="content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
