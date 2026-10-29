# Iluminate Brain Map

> Generated structural snapshot. It is not an instruction file or a source of
> product truth. Start with `.agent/RULES.md`.

## Snapshot

- Generated UTC: `2026-10-26T17:12:31Z`
- Repository root: `/srv/iluminate`
- Git branch: `HETZNER-DEV-2026-Octubre-23`
- Git commit: `7e67794`
- Worktree: `dirty` (24 changed paths, excluding generated context files)
- Status fingerprint: `d6dde32e3117e40ef51b4d5415167dbd13d1f048869c3127e6e635381767ef35`
- Tracked diff fingerprint: `169be92ed1de487623509de05614e3f559dc4c68390c6f5d2f2fb60e36df60d8`

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
iluminate-web
postgres
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

## Maintenance Tools

| Tool | Purpose |
|---|---|
| `.agent/regenerar_contexto.sh` | Regenerate this snapshot and the compact integrity manifest. |
| `.agent/validar_documentacion.sh` | Check routed paths, local links and manifest integrity without modifying files. |
