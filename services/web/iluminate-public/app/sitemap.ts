import type { MetadataRoute } from "next";
import { projects, templates } from "@/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.ILUMINATE_PUBLIC_SITE_URL ?? "https://iluminate.space";
  const staticRoutes = ["", "/projects", "/templates", "/learn", "/learn/designer", "/learn/animate", "/technology", "/for-sign-makers", "/about"];
  return [
    ...staticRoutes.map((route) => ({ url: `${baseUrl}${route}`, changeFrequency: "monthly" as const, priority: route === "" ? 1 : 0.7 })),
    ...projects.map(({ slug }) => ({ url: `${baseUrl}/projects/${slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...templates.map(({ slug }) => ({ url: `${baseUrl}/templates/${slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
