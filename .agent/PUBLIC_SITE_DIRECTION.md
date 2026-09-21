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
- The flagship home hero currently uses a self-contained Three.js/WebGL scene
  that extrudes the canonical brand-mark SVG, with a CSS fallback. Each ray is
  independently hoverable and switchable; the dot acts as a master switch with
  a restrained comet-like light burst. A soft, irregular dark field is confined
  behind the 3D mark to support saturated interactive colors without turning the
  page into a dark theme. It is an editorial experience, not a second simulator
  or an alternative partitura renderer.

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
