# Iluminate Public Site Direction

**Status:** canonical product direction for the public web experience

**Official domain:** `iluminate.space`

**Planned dashboard domain:** `app.iluminate.space`

## Purpose

The public site is not a conventional marketing landing page and must not feel
like a generic WordPress template. It is the public, experiential entrance to
Iluminate: a curated gallery of lighting concepts, interactive project previews,
reusable templates and learning material.

The authenticated dashboard and Designer remain in `services/web/iluminate`.
The public Next.js application lives in:

```text
services/web/iluminate-public
```

It runs as its own deployable container named `iluminate-public-web`, so that
the public site can be deployed, cached, scaled
and secured independently from the authenticated application.

## Domain And Routing

Canonical production routing:

```text
https://iluminate.space      -> public site
https://app.iluminate.space  -> dashboard, Designer and Animate
```

Do not document or introduce a different production domain without an explicit
product decision.

Initial public information architecture:

```text
/
/projects
/projects/[slug]
/templates
/templates/[slug]
/learn
/learn/designer
/learn/animate
/technology
/for-sign-makers
/about
```

Login, signup and `Use this template` actions hand off to
`app.iluminate.space`. Authentication and private editing do not move into the
public application.

## Public Projects And Templates

The first projects are Iluminate-created concepts, not customer case studies.
Never imply clients, installations, results, testimonials or commercial success
that do not exist. Present the collection transparently as concept projects,
lighting studies or `Iluminate Originals`.

Public projects are experiential demonstrations. Templates are reusable,
versioned starting points. A public project may have a template, but not every
showcase must be reusable.

The intended visitor flow is:

```text
discover project
-> interact with scenes, effects and colors
-> choose Use this template
-> authenticate/register
-> create a private tenant-owned copy
-> open it in Designer
```

The public configurator is deliberately limited. It may expose scene, palette,
effect, speed, intensity, play/pause and diffuser presentation. It must not
expose private persistence, deployment, controller credentials, arbitrary
compilation or the full fabrication workflow.

Template cloning must create a new private document resolved from the trusted
session `client_id`. It must never edit the public source or copy deployments,
controllers, credentials, authorship/audit records or stale generated artifacts.

## Simulation And Service Boundaries

- `lighting-core` remains the canonical owner of partitura types, effects,
  validation and frame semantics.
- `services/simulator` should own the reusable read-only player/renderer as it
  leaves the dashboard prototype.
- The public site may consume published snapshots and use the reusable simulator.
- The public Next.js application must not connect directly to PostgreSQL.
- The public container must not receive database credentials, R2 write
  credentials, session secrets or device tokens.
- Prefer browser-side frame evaluation for interactive public previews instead
  of making one server request per animation frame.
- Large public images and video belong in R2/CDN storage; do not grow the Docker
  image into a media archive.

## Learning And YouTube

The public site includes a learning area for videos published through the
official Iluminate YouTube presence. Its initial tracks are:

- `Designer`: canvas, artwork, reference geometry, zones, channels, strings,
  controller connectivity, compile and common validation issues.
- `Animate`: scenes, clips, targets, groups, effects, palettes, timing and
  preview/diffuser behavior.

The public experience should use curated video records and playlists rather
than treating YouTube as the content database. Store stable metadata such as
title, slug, track, level, duration, thumbnail, YouTube video id and ordering in
the public site's content layer. Embed YouTube for playback and link to the
channel/playlist for subscription.

Planned learning routes:

```text
/learn                  -> featured lessons and learning tracks
/learn/designer         -> ordered Designer tutorials
/learn/animate          -> ordered Animate tutorials
/learn/[slug]           -> optional lesson detail/transcript/resources
```

Tutorial cards should distinguish `Beginner`, `Intermediate` and `Advanced`,
and may link directly to the relevant dashboard route after authentication.
Do not require a custom video hosting or LMS platform for the first version.

## Visual Direction

- The public home is project-led, motion-led and editorial.
- A flagship interactive project should carry the hero when performance allows.
- Project cards may preview real frames produced from Iluminate semantics.
- Generated imagery provides environments and concept presentation; dynamic
  lighting should come from the actual partitura/simulator whenever practical.
- Avoid generic SaaS feature grids, fabricated social proof, decorative neon
  cyberpunk cliches and stock WordPress composition patterns.
- Preserve accessibility, reduced-motion behavior, fast mobile fallbacks and
  static poster images for heavy interactive experiences.
- On phone layouts, use a solid 72px sticky header, immediate content instead
  of scroll-triggered reveal gaps, square project media, visible card actions
  and compact vertical section rhythm. Keep the document free of horizontal
  overflow down to a 320px viewport.
- The flagship home hero currently uses a self-contained Three.js/WebGL scene
  that renders the canonical brand-mark SVG as flat graphic geometry, with a
  CSS fallback. Do not reintroduce extrusion, bevels, cast shadows, pointer
  perspective or other simulated 3D volume. The sculpture sits in a neutral
  `#0B0B0D` editorial field on the right side of the light hero, reached through
  a light-to-black fade with no red or burgundy intermediate stops; on
  mobile that field becomes a dark upper band behind the mark. The shared
  breathing cycle starts at its illuminated peak with brand-red `#FF3B30` rays
  and a black dot, then reaches the single resting/off state with black rays.
  The dot remains black with a red halo throughout the entire cycle. Every piece has a fine contour and layered glow derived
  directly from the `SIGNAL` project visual; face color, contour and glow breathe
  in one synchronized rhythm. The black/white resting state must retain a clearly
  visible contour and broad halo; light intensity breathes from high to full
  and never fades away. Keep the resting halo near full power (roughly 84% of
  its peak opacity), so black rays and the white dot remain visibly illuminated.
  Build each halo
  from that piece's exact SVG silhouette, with a centered multi-pass Gaussian
  falloff; do not approximate diagonal rays with independent rectangles. Keep
  the halo geometry fixed and breathe only its intensity so the light never
  appears to slide away from the face. Use one fixed SVG-unit-to-texture scale
  for every piece so the dot and all three rays cast the same halo radius and
  intensity. Each ray is independently hoverable; clicking a ray replaces its
  illuminated-peak color with a solid palette color, while its resting endpoint
  remains black. The dot acts as a master switch with
  a restrained comet-like light burst. The earlier dark nebula has been removed.
  An invisible interaction field preserves the
  pointer experience against the clean light wall. Keep that field confined to
  the sculpture so it never crosses the hero title, and reset old trail points
  on re-entry to prevent long connecting segments. Pointer movement across
  that field or the mark draws a short-lived red wand trail with fine sparks;
  avoid large blob-like
  hover particles. Clicking a ray assigns a new peak color and produces a brief
  star burst from the surface. Clicking the dot assigns separate peak colors to
  every ray while the dot itself remains black with red emission. Every ray
  breathes back toward black. It is an editorial experience,
  not a second simulator or an alternative partitura renderer.
- Treat the settled sculpture appearance as locked: do not change its background,
  face states, breathing rhythm, contour or halo unless the user explicitly
  reopens that direction. The visual and interaction behaviors stay locked, while
  placement and overall scale are resolved from the container aspect ratio by the
  hero framing helper, not by two fixed modes: compact/portrait layouts (phones and
  portrait tablets) center the mark in the upper dark band, while wide layouts hold
  it at the right of the light hero. The scale is clamped by both the visible width
  and height so the full SVG silhouette always stays on frame, and the compact
  position is centered rather than left-shifted. Click
  feedback is intentionally stronger: ray clicks
  cast a broad star burst, while the dot triggers a short, stage-filling festive
  explosion with multicolor comet arms, staggered sparks and a central flash.
- The initial light is red. Color changes happen only through explicit clicks
  and use discrete solid choices such as red, blue, orange, green, violet and
  yellow; do not run an automatic rainbow cycle. All pieces share the exact same
  breathing phase and duration. The installed mark has no
  lateral entrance; idle life comes from a slow, legible opacity pulse in the
  contour and glow, without becoming a blink.
- Keep the desktop sculpture fully below the fixed header at 100% browser zoom,
  including on wide but short viewports. Hero-title tracking must remain tight
  without overlapping glyph counters; excessive negative spacing creates
  apparent diagonal cuts through words such as `con` and `temporada`. Constrain
  the desktop title to the light-side composition (at most 58vw) and keep its
  responsive maximum near 90px so `Rótulos con horario` never crosses into the
  sculpture at 100% browser zoom. The mobile title keeps its separate sizing.

## Initial Delivery Sequence

1. **Complete:** scaffold `services/web/iluminate-public` as an independent Next.js app.
2. **Complete:** add an independent `iluminate-public-web` Docker/Compose service.
3. **Complete:** establish public identity, navigation, SEO and the flagship home experience.
4. **Initial version complete:** publish the first curated concept projects from local typed content.
5. Extract a reusable read-only player into `services/simulator`.
6. Build project detail pages and the restricted public configurator.
7. Add `/learn`, Designer and Animate YouTube collections.
8. Add authenticated `Use this template` handoff and safe private cloning.
9. Introduce persistent publication/template models only after the content and
   cloning workflow are proven.
