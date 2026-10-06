export type DesignerFontResource = {
  id: string;
  label: string;
  family: string;
  weight: 400 | 700;
  hash: string;
  fileName: string;
};

/** Versioned, application-owned fonts. Never substitute an OS/browser font. */
export const DESIGNER_FONT_CATALOG: readonly DesignerFontResource[] = [
  {
    id: "iluminate-roboto-regular-v1",
    label: "Iluminate Sans",
    family: "Iluminate Roboto",
    weight: 400,
    hash: "sha256:901ccd1d83ba9d19e2ba904964da569a3c61c6d652bd39d1ba2f86f26936e8c9",
    fileName: "roboto-latin-400-normal.woff"
  },
  {
    id: "iluminate-roboto-bold-v1",
    label: "Iluminate Sans Bold",
    family: "Iluminate Roboto",
    weight: 700,
    hash: "sha256:c290b7f91e9339051021840082eb3ea14ad5c17f652b16f816867ecf9e6f37f9",
    fileName: "roboto-latin-700-normal.woff"
  }
] as const;

export const DEFAULT_DESIGNER_FONT_ID = DESIGNER_FONT_CATALOG[0].id;

export function designerFontResource(fontId: string) {
  return DESIGNER_FONT_CATALOG.find((font) => font.id === fontId) ?? null;
}

export function designerFontUrl(fontId: string) {
  return `/api/lighting/fonts/${encodeURIComponent(fontId)}`;
}
