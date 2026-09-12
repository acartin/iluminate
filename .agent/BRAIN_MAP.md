# BRAIN_MAP

- Generated UTC: `2026-09-10T23:02:17Z`
- Repo root: `/srv/iluminate`
- Git branch: `HETZNER-DEV-2026-Setiembre-8`
- Git commit: `8061f3d`

## 1. MAPA DE INTENCIONES (ILUMINATE)

| Carpeta | Responsabilidad tecnica | Importancia (1-5) |
|---|---|---:|
| `compose.yml` | Compose local actual; validar antes de tocar infraestructura. | 4 |
| `services/web/iluminate` | Next.js UI, portal, editor/simulador inicial y adaptadores temporales. | 5 |
| `services/lighting-core` | Dominio LED: rutas fisicas, pixelMap, zones, groups, partitura, scenes, validation y deployments. | 5 |
| `services/auth` | Identidad, organizaciones, roles, permisos, sesiones y auth API. | 4 |
| `services/simulator` | Simulacion reusable cuando salga del prototipo web. | 4 |
| `services/device-protocol` | Contratos cloud/controlador y estado deseado/reportado. | 4 |
| `services/firmware` | Notas de contrato y spikes temporales; firmware PlatformIO organizado en repo externo. | 4 |
| `docs` | Documentacion de arquitectura y ciclo de vida de partitura. | 5 |
| `.agent` | Reglas operativas y contexto maestro para agentes. | 5 |

## 2. LIMITES DE ARQUITECTURA

- Este repo produce y valida partituras; el firmware ESP32 organizado vive en repo externo PlatformIO.
- El modelo de dominio vive en `lighting-core`, no en el web.
- Auth vive en `auth`, no en `lighting-core`.
- El web no se conecta directo a Postgres.
- El ESP32 externo ejecuta partitura validada, no codigo arbitrario.
- El hardware se modela aqui solo como tres salidas logicas: `chain.output` 1, 2 y 3.
- El sistema es multitenant por diseno; toda tabla persistente de negocio debe contemplar `client_id`.
- PostgreSQL es la base de datos objetivo.
- Mantener separados el cableado fisico (controller, data cables, LED strings y nodos) y los objetivos visuales (zones y groups). Los segmentos/rangos logicos no son flujo normal de autoria; el pixelMap los deriva cuando haga falta.
- Leer `.agent/EFFECT_TARGETING_MODEL.md` antes de cambiar compilacion, pixelMap, zonas, grupos, efectos o simulador.

## 3. SERVICIOS DOCKER ACTUALES

```text
iluminate-web
postgres
```

## 4. TOPOLOGIA DE TRABAJO

```text
services
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
services/firmware/esp32-fastled-spike/fixtures
services/lighting-core
services/lighting-core/api
services/lighting-core/contracts
services/lighting-core/domain
services/lighting-core/domain/chains
services/lighting-core/domain/clips
services/lighting-core/domain/controllers
services/lighting-core/domain/deployments
services/lighting-core/domain/effects
services/lighting-core/domain/partituras
services/lighting-core/domain/scenes
services/lighting-core/domain/segments
services/lighting-core/domain/tracks
services/lighting-core/domain/zones
services/lighting-core/fixtures
services/lighting-core/generators
services/lighting-core/migrations
services/lighting-core/pixel-map
services/lighting-core/player
services/lighting-core/schemas
services/lighting-core/storage
services/lighting-core/tests
services/lighting-core/validators
services/simulator
services/web
services/web/iluminate
services/web/iluminate/app
services/web/iluminate/app/[group]
services/web/iluminate/app/api
services/web/iluminate/app/console
services/web/iluminate/app/forgot-password
services/web/iluminate/app/login
services/web/iluminate/app/partituras
services/web/iluminate/app/projects
services/web/iluminate/app/reset-password
services/web/iluminate/app/settings
services/web/iluminate/components
services/web/iluminate/components/crud
services/web/iluminate/components/lighting
services/web/iluminate/components/portal
services/web/iluminate/components/ui
services/web/iluminate/components/workspace
services/web/iluminate/docs
services/web/iluminate/lib
services/web/iluminate/lib/lighting
services/web/iluminate/lib/server
services/web/iluminate/public
services/web/iluminate/public/vendor
```

## 5. ARCHIVOS RELEVANTES

```text
services/README.md
services/auth/README.md
services/auth/api/README.md
services/auth/contracts/README.md
services/auth/domain/README.md
services/auth/migrations/.gitkeep
services/auth/migrations/2026-08-19_create_auth_password_reset_tokens.sql
services/auth/migrations/2026-08-19_create_auth_security_baseline.sql
services/auth/storage/README.md
services/auth/tests/.gitkeep
services/device-protocol/README.md
services/firmware/README.md
services/firmware/esp32-fastled-spike/README.md
services/firmware/esp32-fastled-spike/esp32-fastled-spike.ino
services/firmware/esp32-fastled-spike/fixtures/one-strip-100.partitura.json
services/lighting-core/README.md
services/lighting-core/api/README.md
services/lighting-core/contracts/README.md
services/lighting-core/domain/README.md
services/lighting-core/domain/chains/.gitkeep
services/lighting-core/domain/clips/.gitkeep
services/lighting-core/domain/controllers/.gitkeep
services/lighting-core/domain/deployments/.gitkeep
services/lighting-core/domain/effects/.gitkeep
services/lighting-core/domain/effects/catalog.ts
services/lighting-core/domain/partituras/types.ts
services/lighting-core/domain/scenes/.gitkeep
services/lighting-core/domain/segments/.gitkeep
services/lighting-core/domain/tracks/.gitkeep
services/lighting-core/domain/zones/.gitkeep
services/lighting-core/fixtures/README.md
services/lighting-core/fixtures/partitura-v1-invalid-output.json
services/lighting-core/fixtures/partitura-v1-invalid-references.json
services/lighting-core/fixtures/partitura-v1-minimal.json
services/lighting-core/generators/partitura-generator.ts
services/lighting-core/index.ts
services/lighting-core/migrations/.gitkeep
services/lighting-core/migrations/2026-08-19_create_iluminate_operational_tables.sql
services/lighting-core/migrations/2026-08-22_create_iluminate_partituras.sql
services/lighting-core/migrations/2026-08-22_remove_partitura_revisions.sql
services/lighting-core/migrations/2026-09-09_projects_many_partituras.sql
services/lighting-core/package-lock.json
services/lighting-core/package.json
services/lighting-core/pixel-map/builders.ts
services/lighting-core/pixel-map/create-pixel-map.ts
services/lighting-core/player/scene-player.ts
services/lighting-core/player/ws2812b-simulator.ts
services/lighting-core/schemas/README.md
services/lighting-core/schemas/partitura.v1.schema.json
services/lighting-core/storage/README.md
services/lighting-core/tests/.gitkeep
services/lighting-core/tests/validate-fixtures.test.ts
services/lighting-core/tsconfig.json
services/lighting-core/validators/README.md
services/lighting-core/validators/partitura-validator.ts
services/simulator/README.md
services/web/iluminate/Dockerfile
services/web/iluminate/README.md
services/web/iluminate/app/globals.css
services/web/iluminate/app/icon.svg
services/web/iluminate/app/layout.tsx
services/web/iluminate/app/not-found.tsx
services/web/iluminate/app/page.tsx
services/web/iluminate/docs/theme-standard.md
services/web/iluminate/lib/api.ts
services/web/iluminate/lib/feedback.ts
services/web/iluminate/lib/modules.ts
services/web/iluminate/lib/request-url.ts
services/web/iluminate/lib/types.ts
services/web/iluminate/lib/utils.ts
services/web/iluminate/next-env.d.ts
services/web/iluminate/next.config.mjs
services/web/iluminate/package-lock.json
services/web/iluminate/package.json
services/web/iluminate/postcss.config.mjs
services/web/iluminate/tailwind.config.ts
services/web/iluminate/tsconfig.json
.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md
.agent/AI_CONTEXT_PACK.md
.agent/BRAIN_MAP.md
.agent/DATABASE_MODEL.md
.agent/DESIGNER_HANDOFF.md
.agent/EFFECT_TARGETING_MODEL.md
.agent/EXECUTION_MAP.md
.agent/FILESYSTEM_GUARDRAILS.md
.agent/ILUMINATE_BOOTSTRAP.md
.agent/ILUMINATE_UI_STANDARDS.md
.agent/IMPLEMENTATION_PLAN.md
.agent/PIXELMAP_COMPOSER_DIRECTION.md
.agent/RULES.md
.agent/regenerar_contexto.sh
```
