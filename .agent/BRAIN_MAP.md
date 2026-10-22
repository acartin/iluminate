# Iluminate Brain Map

> Generated structural snapshot. It is not an instruction file or a source of
> product truth. Start with `.agent/RULES.md`.

## Snapshot

- Generated UTC: `2026-10-17T20:57:55Z`
- Repository root: `/srv/iluminate`
- Git branch: `HETZNER-DEV-2026-Octubre-17B`
- Git commit: `6890d15`
- Worktree: `dirty` (5 changed paths, excluding generated context files)
- Status fingerprint: `287c781a6f5942745e56eb7ba3bb7d4c246e0df538d185256c524443f5068404`
- Tracked diff fingerprint: `7006d5e3edf44688e5f41558d7eabf10d6dd0140bc431fd9bf0dde4490c78fb9`

The commit identifies the base revision. When the worktree is dirty, the two
fingerprints distinguish the local state without copying diffs or secrets into
this file. Untracked file contents are never read for fingerprinting.

## Service Ownership

| Path | Owner |
|---|---|
| `services/web/iluminate` | Authenticated Next.js UI, Designer and UI adapters. |
| `services/web/iluminate-public` | Public site and read-only public experiences. |
| `services/web/iluminate-prompt-builder` | Internal generator for scoped AI change contracts. |
| `services/lighting-core` | Canonical LED, effect, partitura and validation domain. |
| `services/auth` | Identity, sessions, organizations, roles and permissions. |
| `services/render-worker` | Private queue worker for deterministic MP4/WebP scene rendering. |
| `services/device-protocol` | Cloud/controller protocol contracts. |
| `services/firmware` | Compatibility notes and temporary spikes; organized firmware is external. |
| `docs` | Lifecycle and operational runbooks selected by task. |
| `.agent` | AI router, durable contracts and generated context metadata. |

## Compose Services

```text
postgres
iluminate-web
render-worker
iluminate-public-web
```

## Context Inventory

| Document | Role |
|---|---|
| `AGENTS.md` | Repository-level pointer to the mandatory AI rules. |
| `.agent/RULES.md` | Mandatory AI procedure and context router. |
| `.agent/ILUMINATE_BOOTSTRAP.md` | Human guide for assigning work to AI. |
| `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md` | Product/domain direction. |
| `.agent/FILESYSTEM_GUARDRAILS.md` | Service ownership and dependency boundaries. |
| `.agent/DESIGNER_UX_CONTRACT.md` | Authoritative Designer interaction contract. |
| `.agent/DESIGNER_HANDOFF.md` | Current Designer implementation handoff. |
| `.agent/PIXELMAP_COMPOSER_DIRECTION.md` | Composer and physical mapping direction. |
| `.agent/EFFECT_TARGETING_MODEL.md` | Effect targets and coordinate semantics. |
| `.agent/ILUMINATE_UI_STANDARDS.md` | Authenticated web UI standards. |
| `.agent/PUBLIC_SITE_DIRECTION.md` | Public-site product and visual direction. |
| `.agent/DATABASE_MODEL.md` | Persistence and tenant model. |
| `.agent/IMPLEMENTATION_PLAN.md` | Roadmap and phase status. |
| `.agent/EXECUTION_MAP.md` | Validation routes and commands. |
| `services/web/iluminate-prompt-builder/README.md` | Internal prompt-builder usage and ownership. |
| `docs/partitura-lifecycle.md` | Partitura source/compile/generate/device lifecycle. |
| `docs/public-showroom-viewer-architecture.md` | Project shares, app-hosted Viewer and showroom architecture. |
| `docs/production-deployment.md` | Production operations runbook. |
| `docs/upgrade.doc` | Completed Designer upgrade specification and regression history. |

## Current Service Topology

```text
services/auth
services/auth/api
services/auth/contracts
services/auth/domain
services/auth/migrations
services/auth/storage
services/auth/tests
services/device-protocol
services/firmware
services/firmware/esp32-fastled-spike
services/lighting-core
services/lighting-core/api
services/lighting-core/contracts
services/lighting-core/domain
services/lighting-core/fixtures
services/lighting-core/generators
services/lighting-core/migrations
services/lighting-core/pixel-map
services/lighting-core/player
services/lighting-core/schemas
services/lighting-core/storage
services/lighting-core/tests
services/lighting-core/validators
services/render-worker
services/web
services/web/iluminate
services/web/iluminate-prompt-builder
services/web/iluminate-public
```

Use `rg --files <affected-path>` for file-level discovery. A complete file
inventory is intentionally omitted because it is expensive, noisy and quickly
stale.
