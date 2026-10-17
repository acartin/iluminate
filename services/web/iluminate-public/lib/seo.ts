import type { Metadata } from "next";

export const siteConfig = {
  name: "Iluminate",
  defaultTitle: "Iluminate — Rótulos que se mueven con luz",
  description:
    "Diseña, anima y controla rótulos 3D con iluminación direccionable. Explora proyectos, templates y el sistema creativo de Iluminate.",
  locale: "es_CR",
  language: "es",
  socialImagePath: "/opengraph-image",
};

export function getSiteUrl() {
  return new URL(process.env.ILUMINATE_PUBLIC_SITE_URL ?? "https://iluminate.space");
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

export function brandedTitle(title: string) {
  return title === siteConfig.defaultTitle || title.endsWith("— Iluminate")
    ? title
    : `${title} — Iluminate`;
}

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  robots?: Metadata["robots"];
};

export function createPageMetadata({
  title,
  description,
  path,
  robots,
}: PageMetadataInput): Metadata {
  const socialTitle = brandedTitle(title);

  return {
    title,
    description,
    alternates: { canonical: path },
    robots,
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      siteName: siteConfig.name,
      title: socialTitle,
      description,
      url: path,
      images: [
        {
          url: siteConfig.socialImagePath,
          width: 1200,
          height: 630,
          alt: "Iluminate — diseño y control de iluminación direccionable para rótulos",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [siteConfig.socialImagePath],
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}#website`,
    url: absoluteUrl("/"),
    name: siteConfig.name,
    description: siteConfig.description,
    inLanguage: siteConfig.language,
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
