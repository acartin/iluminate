# Iluminate Public

Public experience for `iluminate.space`. This application owns the editorial
site, concept projects, reusable template discovery and learning content. The
authenticated authoring application remains in `services/web/iluminate`.

## Local development

```bash
npm ci
npm run dev
```

The app listens on port `3000` directly or `${ILUMINATE_PUBLIC_WEB_PORT:-8430}`
through the root Compose project.

## Environment

- `ILUMINATE_PUBLIC_SITE_URL`: canonical public URL used by metadata and sitemap.
- `NEXT_PUBLIC_ILUMINATE_APP_URL`: dashboard handoff URL; production value is
  `https://app.iluminate.space`.

The public container intentionally receives no database, storage-write,
authentication or device credentials.

## Flagship hero

The home hero is rendered in real time with Three.js/WebGL. It presents the
brand mark as a fabricated wall sculpture using physically based materials,
real-time soft shadows, restrained rear illumination and pointer parallax.
Rendering pauses when the hero leaves the viewport, limits pixel density on
mobile, respects `prefers-reduced-motion` and retains a CSS fallback when WebGL
is unavailable.

This scene is an editorial brand experience. It does not implement canonical
partitura or simulator semantics.

## Content status

The initial project collection contains clearly labelled Iluminate concept
studies. Interactive previews are local presentation components, not the
canonical simulator. They should be replaced by published read-only partitura
snapshots once the reusable player is extracted into `services/simulator`.
