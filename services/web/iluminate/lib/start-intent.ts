export type StartTemplate = {
  slug: string;
  name: string;
  description: string;
};

const templates: Record<string, StartTemplate> = {
  "secuencia-signal": {
    slug: "secuencia-signal",
    name: "Secuencia Signal",
    description: "Starting point for dimensional letters with progressive ignition, traversal and ambient breathing."
  },
  "orbita-modular": {
    slug: "orbita-modular",
    name: "Órbita modular",
    description: "Starting point for radial symbols with concentric zones and timing offsets."
  }
};

export function getStartTemplate(slug?: string) {
  return slug ? templates[slug] : undefined;
}
