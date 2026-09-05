# BRAIN_MAP

- Generated UTC: `2026-09-02T00:00:00Z`
- Designer handoff: `.agent/DESIGNER_HANDOFF.md`
- Last Designer handoff update: `2026-09-05`
- Repo root: `/srv/iluminate`
- Git branch: `HETZNER-DEV-2026-Agosto-23`
- Git commit: `7f7c4a2`

## 1. MAPA DE INTENCIONES (ILUMINATE)

| Carpeta | Responsabilidad tecnica | Importancia (1-5) |
|---|---|---:|
| `compose.yml` | Compose local actual; validar antes de tocar infraestructura. | 4 |
| `services/web/iluminate` | Next.js UI, portal, editor/simulador inicial y adaptadores temporales. | 5 |
| `services/lighting-core` | Dominio LED: chains, segments, zones, pixelMap, efectos, partitura, scenes, validation y simulacion. | 5 |
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
- Mantener separados chains/segments/rutas fisicas y zones visuales.
- `pixelMap` es la capa de georreferenciacion que une `output/index` fisico con `x/y` visual.
- La matriz gigante es un espacio virtual interno para efectos; no debe ser el concepto principal de UI para el operador.
- En producto real, el operador trabaja sobre SVG/canvas, zonas, cables LED continuos y cables de datos; el sistema genera el `pixelMap` solo desde los cables LED.
- Diferenciar siempre `LED string` y `Data cable`: el `LED string` representa tira fisica WS2812B y compila LEDs/segmentos; el `Data cable` es verde, sirve para planear la senal y no genera LEDs.
- El Designer debe incluir siempre una tarjeta controladora en el canvas. La tarjeta se puede mover y persistir, pero no borrar. Por defecto nace cerca de la esquina superior izquierda, con una franja libre para el PCB/cableado; las zonas/rutas iniciales deben arrancar bastante mas a la derecha para no encimarse. Tiene 3 conectores/salidas de datos. Mas adelante el menu de configuracion permitira variar esa cantidad, porque hay controladores de 12 salidas o mas.
- Las rutas (`LED string` y `Data cable`) son polilineas editables. Sus puntos son nodos de fabricacion: dobleces, bajadas, vueltas o puntos donde se puede cortar/soldar. Insertar un nodo no rompe continuidad; cortar en un nodo interno divide la ruta en dos rutas continuas.
- Los nodos de fabricacion no son LEDs y no deben sustituir un LED. En `LED string`, los LEDs se muestrean dentro de cada tramo, desplazados medio paso para quedar entre nodos/cortes/vueltas.
- Convencion de direccion en rutas: punto verde = inicio/entrada/DIN, punto rojo = final/salida/DOUT, flecha = flujo serial.
- La direccionalidad se debe mostrar con flechas sobre cada tramo de `LED string` y `Data cable`, no solo con el color de terminal. Los puertos rojos del controlador tambien muestran flecha de salida.
- La herramienta tijera corta rutas en nodos internos. No hay herramienta cautin: soldar ocurre automaticamente cuando una terminal roja y una verde quedan exactamente sobre el mismo punto de snap del grid. Si no comparten el mismo punto de snap, no se suelda.
- Soldar es una regla fisica/geometrica simple: verde con rojo en el mismo snap point suelda, sin importar si son `LED string` o `Data cable`. Las validaciones de output/zona pueden venir despues como advertencias, pero no deben bloquear el dibujo.
- Si se unen dos rutas del mismo tipo, las rutas se fusionan y desaparece el nodo duplicado. Si se une `Data cable` con `LED string`, el cable se conecta visualmente a la tira LED sin convertirse en LEDs y adopta el output de la tira.
- Al arrastrar un nodo cian ya soldado, todos los terminales del mismo joint se mueven juntos para que la union se sienta como un punto fisico continuo y no como piezas que se despegan.
- Los puertos rojos del controlador tambien son puntos de snap y deben tener el mismo tamano visual que las terminales de las rutas. Si la terminal verde inicial de un `Data cable` cae en el mismo snap point que un puerto rojo, queda soldada al controlador, el puerto se pinta cian y el cable toma el output de ese puerto. Al mover la tarjeta controladora, los cables soldados a sus puertos se mueven con ella.
- Esta arquitectura grafica es base para una emulacion electrica posterior: controlador + puertos + data cables + LED strings + terminales + joints forman un grafo fisico. Sobre ese grafo se podran validar salidas sin conexion, cadenas sin entrada, direcciones invertidas, ramas ambiguas, outputs duplicados y continuidad desde cada puerto hasta las tiras.
- Un nodo soldado se persiste con `joint: true` y se pinta cian para confirmar visualmente que la soldadura si ocurrio.
- Un proyecto usa una sola densidad LED. Si cambia, se resetea el cableado/rutas.
- La densidad no se infiere de una tira dibujada: si el proyecto dice `60 LED/m`, un `LED string` de `100 cm` debe generar cerca de 60 LEDs. Si genera 54, el trazo mide cerca de 90 cm o la escala del canvas esta mal.
- Los presets de matrices son para `Effect Lab`; el composer real debe nacer de SVG/canvas + zonas + rutas.
- Efectos espaciales deben soportar los modos conceptuales `Whole Sign`, `Each Element` y `Sequential Elements`.
- UX actual: `Designer` existe como item principal del menu. `/partituras/designer` muestra un grid de partituras del tenant; `/partituras/designer/[id]` abre un estudio full-screen con top bar, barra contextual superior, tool rail izquierdo, canvas central y status bar inferior.
- `Layout` queda como vista tecnica/debug dentro del workspace de partitura, no como flujo principal de composicion visual.
- Si una IA retoma el Designer, debe leer primero `.agent/DESIGNER_HANDOFF.md`; ahi estan las reglas actuales de snap, soldadura, controlador, defaults y validacion.

## 2.1 ESTADO ACTUAL DEL DESIGNER

- Ruta grid: `/partituras/designer`.
- Ruta editor: `/partituras/designer/[id]`.
- Partitura local activa: `id=1`, `partitura_key=default_installation`, `status=draft`, canvas `170x40 cm`, 4 rutas.
- El documento activo fue reseteado para preservar `default_installation` y quitar el layout viejo encimado. `generated_json` quedo en `null` para evitar artefacto stale.
- El duplicado `default_installation_2` fue soft-deleted.
- Validacion reciente usada: `git diff --check` y `docker compose up -d --build iluminate-web`.

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
services/lighting-core/package-lock.json
services/lighting-core/package.json
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
.agent/EXECUTION_MAP.md
.agent/FILESYSTEM_GUARDRAILS.md
.agent/ILUMINATE_BOOTSTRAP.md
.agent/ILUMINATE_UI_STANDARDS.md
.agent/IMPLEMENTATION_PLAN.md
.agent/PIXELMAP_COMPOSER_DIRECTION.md
.agent/RULES.md
.agent/regenerar_contexto.sh
```
