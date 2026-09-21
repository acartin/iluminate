export type ProjectVisual = "signal" | "orbit" | "ribbon" | "monolith";

export type Project = {
  slug: string;
  index: string;
  title: string;
  kind: string;
  year: string;
  location: string;
  summary: string;
  statement: string;
  visual: ProjectVisual;
  colors: [string, string, string];
  templateSlug?: string;
  specs: Array<[string, string]>;
};

export const projects: Project[] = [
  {
    slug: "signal-no-01",
    index: "P—01",
    title: "Signal No. 01",
    kind: "Rótulo volumétrico · Estudio de luz",
    year: "2026",
    location: "Iluminate Original",
    summary:
      "Una palabra sólida que deja de comportarse como un objeto estático. Tres recorridos de luz articulan ritmo, lectura y presencia.",
    statement:
      "El estudio explora cuánto movimiento necesita un rótulo para sentirse vivo sin perder claridad. La secuencia parte de un pulso mínimo, recorre el volumen y termina en una respiración uniforme.",
    visual: "signal",
    colors: ["#ff3b30", "#ff9f0a", "#f4f1ea"],
    templateSlug: "secuencia-signal",
    specs: [
      ["Formato", "Letras volumétricas"],
      ["Escenas", "03"],
      ["Salidas", "03"],
      ["Estado", "Concepto interactivo"],
    ],
  },
  {
    slug: "orbita",
    index: "P—02",
    title: "Órbita",
    kind: "Identidad espacial · Movimiento circular",
    year: "2026",
    location: "Iluminate Original",
    summary:
      "Capas concéntricas construyen una señal que parece rotar sin que ninguna pieza física se mueva.",
    statement:
      "Órbita utiliza desfases de tiempo entre zonas para producir profundidad aparente. La luz no decora el símbolo: define su geometría y dirige la mirada.",
    visual: "orbit",
    colors: ["#ff3b30", "#ff5e3a", "#7dd3fc"],
    templateSlug: "orbita-modular",
    specs: [
      ["Formato", "Símbolo corpóreo"],
      ["Escenas", "04"],
      ["Zonas", "06"],
      ["Estado", "Concepto interactivo"],
    ],
  },
  {
    slug: "umbral",
    index: "P—03",
    title: "Umbral",
    kind: "Fachada · Luz arquitectónica",
    year: "2026",
    location: "Iluminate Original",
    summary:
      "Una línea de luz transforma un acceso en una transición coreografiada entre calle, marca y espacio.",
    statement:
      "La instalación se comporta de forma contenida a distancia y revela una segunda cadencia al acercarse. Es un ensayo sobre señalización que también construye atmósfera.",
    visual: "ribbon",
    colors: ["#ff3b30", "#a855f7", "#f4f1ea"],
    specs: [
      ["Formato", "Intervención de fachada"],
      ["Escenas", "02"],
      ["Recorrido", "12 m"],
      ["Estado", "Estudio conceptual"],
    ],
  },
  {
    slug: "monolito-rgb",
    index: "P—04",
    title: "Monolito RGB",
    kind: "Objeto de marca · Sistema modular",
    year: "2026",
    location: "Iluminate Original",
    summary:
      "Un objeto compacto demuestra cómo una misma construcción física puede asumir identidades completamente distintas.",
    statement:
      "Monolito RGB separa estructura y comportamiento. El cuerpo permanece; escenas, paletas y transiciones cambian para cada momento de la marca.",
    visual: "monolith",
    colors: ["#ff3b30", "#22d3ee", "#f4f1ea"],
    specs: [
      ["Formato", "Objeto autoportante"],
      ["Escenas", "05"],
      ["Control", "Direccionable"],
      ["Estado", "Estudio conceptual"],
    ],
  },
];

export const templates = [
  {
    slug: "secuencia-signal",
    index: "T—01",
    title: "Secuencia Signal",
    format: "Letras volumétricas",
    description:
      "Una base con encendido progresivo, recorrido y respiración ambiental para palabras y logotipos lineales.",
    projectSlug: "signal-no-01",
    visual: "signal" as ProjectVisual,
    colors: ["#ff3b30", "#ff9f0a", "#f4f1ea"] as [string, string, string],
  },
  {
    slug: "orbita-modular",
    index: "T—02",
    title: "Órbita modular",
    format: "Símbolos y logotipos",
    description:
      "Zonas concéntricas y desfases temporales listos para adaptar a marcas circulares o radiales.",
    projectSlug: "orbita",
    visual: "orbit" as ProjectVisual,
    colors: ["#ff3b30", "#ff5e3a", "#7dd3fc"] as [string, string, string],
  },
];

export const lessons = [
  {
    track: "Designer",
    number: "01",
    title: "Del SVG al lienzo físico",
    level: "Inicial",
    duration: "Próximamente",
    description: "Prepara geometría limpia, escala el rótulo y organiza sus zonas visuales.",
  },
  {
    track: "Designer",
    number: "02",
    title: "Dibujar strings y cableado",
    level: "Inicial",
    duration: "Próximamente",
    description: "Traza recorridos reales, dirección de datos y conexiones al controlador.",
  },
  {
    track: "Animate",
    number: "01",
    title: "Construir una primera escena",
    level: "Inicial",
    duration: "Próximamente",
    description: "Convierte zonas en una secuencia usando pistas, clips y efectos.",
  },
  {
    track: "Animate",
    number: "02",
    title: "Ritmo, color y transiciones",
    level: "Intermedio",
    duration: "Próximamente",
    description: "Ajusta paletas, velocidades y tiempos sin perder legibilidad de marca.",
  },
];

export const appUrl = process.env.NEXT_PUBLIC_ILUMINATE_APP_URL ?? "https://app.iluminate.space";
