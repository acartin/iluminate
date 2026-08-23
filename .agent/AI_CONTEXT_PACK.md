# AI Context Pack

- Generated UTC: `2026-08-22T22:28:35Z`
- Repo root: `/srv/iluminate`
- Git branch: `N/A`
- Git commit: `N/A`
- Policy: high-signal only; enfocado en Iluminate.

## Contexto Maestro

### `.agent/BRAIN_MAP.md`

```
# BRAIN_MAP

- Generated UTC: `2026-08-22T22:28:35Z`
- Repo root: `/srv/iluminate`
- Git branch: `N/A`
- Git commit: `N/A`

## 1. MAPA DE INTENCIONES (ILUMINATE)

| Carpeta | Responsabilidad tecnica | Importancia (1-5) |
|---|---|---:|
| `compose.yml` | Compose local actual; validar antes de tocar infraestructura. | 4 |
| `services/web/iluminate` | Next.js UI, portal, editor/simulador inicial y adaptadores temporales. | 5 |
| `services/lighting-core` | Dominio LED: chains, segments, zones, partitura, scenes, validation y deployments. | 5 |
| `services/auth` | Identidad, organizaciones, roles, permisos, sesiones y auth API. | 4 |
| `services/simulator` | Simulacion reusable cuando salga del prototipo web. | 4 |
| `services/device-protocol` | Contratos cloud/controlador y estado deseado/reportado. | 4 |
| `services/firmware` | Notas de contrato con el firmware ESP32 externo; no build en este repo. | 4 |
| `.agent` | Reglas operativas y contexto maestro para agentes. | 5 |

## 2. LIMITES DE ARQUITECTURA

- Este repo produce y valida partituras; el firmware ESP32 que las interpreta se construye fuera del monorepo.
- El modelo de dominio vive en `lighting-core`, no en el web.
- Auth vive en `auth`, no en `lighting-core`.
- El web no se conecta directo a Postgres.
- El ESP32 externo ejecuta partitura validada, no codigo arbitrario.
- El hardware se modela aqui solo como tres salidas logicas: `chain.output` 1, 2 y 3.
- El sistema es multitenant por diseno; toda tabla persistente de negocio debe contemplar `client_id`.
- PostgreSQL es la base de datos objetivo.
- Mantener separados chains/segments fisicos y zones visuales.

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
.agent/EXECUTION_MAP.md
.agent/FILESYSTEM_GUARDRAILS.md
.agent/ILUMINATE_BOOTSTRAP.md
.agent/ILUMINATE_UI_STANDARDS.md
.agent/IMPLEMENTATION_PLAN.md
.agent/RULES.md
.agent/regenerar_contexto.sh
```
### `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md`

```
# Contexto maestro para IA — Plataforma de coreografía LED

**Estado:** documento base de producto y arquitectura  
**Fecha:** 18 de agosto de 2026  
**Nombre del producto:** Iluminate  
**Propósito del documento:** permitir que otra IA o desarrollador comprenda rápidamente qué se quiere construir, por qué, cuáles decisiones ya están tomadas y cómo debe evolucionar el sistema.

---

## 1. Instrucciones para la IA que continúe el proyecto

Este documento es la referencia conceptual principal del proyecto. Antes de proponer código o arquitectura:

1. Conservar las decisiones marcadas como **decididas**.
2. No convertir el producto en un editor vectorial general, una copia de WLED ni un sistema de video.
3. No generar un firmware diferente para cada instalación.
4. Mantener separados el **core compilado** y la **partitura actualizable**.
5. Mantener separados el modelo físico —cadenas y segmentos— y el modelo visual —zonas—.
6. Diseñar para profesionales de rótulos, stands y mobiliario comercial; no para consumidores sin conocimientos técnicos.
7. No introducir complejidad futura dentro del MVP, pero evitar decisiones que cierren las extensiones previstas.
8. Cuando se proponga cambiar un concepto establecido, explicar primero qué problema concreto resuelve el cambio.
9. Tratar el firmware ESP32 como un ambiente externo a este repo. Este repo produce, valida, simula y publica partituras; no contiene el proyecto Arduino/PlatformIO/ESP-IDF.

---

## 2. Resumen ejecutivo

Se quiere construir una plataforma B2B que permita a fabricantes establecidos de rótulos, stands de feria y mobiliario comercial ofrecer iluminación LED direccionable, dinámica, coordinada y administrable remotamente, sin tener que desarrollar electrónica, firmware ni aplicaciones web.

La solución completa tendrá:

- Un controlador propio basado en ESP32.
- Tres salidas físicas de datos para tiras WS2812B.
- Un firmware universal externo con un motor de iluminación y una biblioteca de efectos.
- Una partitura declarativa, separada del firmware, que define cadenas, segmentos, zonas, escenas, pistas, clips, efectos seleccionados y temporización.
- Un editor web visual con canvas, reglas, escala, herramientas para dibujar cadenas y segmentos, zonas y una timeline estilo CapCut.
- Un simulador que reproduce la partitura sobre una fotografía, render o plano de la instalación.
- Publicación y cambio remoto de partituras y escenas sin recompilar el firmware.
- Administración en la nube de proyectos, controladores, revisiones, despliegues y escena activa.

En lo que concierne a este repositorio, el controlador se abstrae como tres salidas lógicas: `chain.output` 1, 2 y 3. Los pines concretos del ESP32, la librería LED y el toolchain viven en el ambiente local de firmware.

La frase que resume la arquitectura es:

> **El core define qué sabe hacer el controlador; la partitura define qué debe hacer cada instalación.**

La frase que resume el producto es:

> **El aliado construye el rótulo, stand o exhibidor; la plataforma le proporciona el sistema nervioso luminoso.**

---

## 3. Contexto comercial

### 3.1 Cliente objetivo

El cliente directo no será inicialmente la marca ni el consumidor final. Serán aliados profesionales:

- Fabricantes de rótulos establecidos.
- Fabricantes de letras volumétricas.
- Agencias y constructores de stands para ferias.
- Fabricantes de exhibidores y mobiliario de punto de venta.
- Agencias BTL, de activaciones y de *trade marketing*.

Estas empresas ya saben diseñar, fabricar, cablear e instalar. La persona que administra el proyecto suele conocer suficientemente la construcción interna del rótulo o stand. Habrá capacitación específica para usar el sistema.

### 3.2 División de responsabilidades

| Actividad | Aliado fabricante | Plataforma/proveedor tecnológico |
| --- | ---: | ---: |
| Conseguir y atender al cliente final | Sí | No |
| Diseñar el rótulo, stand o mueble | Sí | No |
| Fabricar e instalar | Sí | No |
| Cableado, fuentes y terminación física | Sí | No |
| Soporte de primera línea al cliente final | Sí | No |
| Controlador y firmware | No | Sí |
| Editor, simulador y nube | No | Sí |
| Configuración y coreografía | Compartido/self-service | Sí, como plataforma |
| Soporte tecnológico de segundo nivel | No | Sí |

El aliado incorpora la solución a su catálogo, define su precio al cliente y añade su margen. El proveedor tecnológico cobra al aliado por controlador, configuración, servicios y, posteriormente, administración en la nube o nuevas campañas.

### 3.3 Lo que no se quiere hacer

- Competir en el mercado saturado de rótulos sencillos con tiras LED baratas.
- Convertirse en fabricante o instalador de rótulos.
- Atender directamente al cliente final.
- Depender de soporte urgente permanente.
- Basar el margen principal en la reventa de tiras, que son mercancía fácilmente comparable.
- Construir una operación crítica en tiempo real: si la nube se cae, la instalación debe continuar funcionando localmente.

### 3.4 Foso competitivo

Ninguna pieza aislada constituye el foso. El foso es la integración de:

- Conocimiento de rótulos e iluminación física.
- Electrónica y controlador propio.
- Firmware ESP32.
- Biblioteca de efectos probados.
- Motor de coreografía sincronizada.
- Editor visual especializado.
- Simulación.
- Despliegue remoto seguro.
- Historial y versionado de instalaciones.
- Red de aliados capacitados.
- Base instalada de controladores.

Un rotulista normalmente no conoce controladores ni software; un programador embebido normalmente no conoce el flujo de fabricación; y un desarrollador web normalmente no conoce la electrónica y las limitaciones físicas. El valor está en unir las disciplinas dentro de un proceso comercial utilizable.

---

## 4. Casos de uso

El rótulo es el punto de entrada, no el límite del producto.

- Letras volumétricas con encendido coordinado.
- Logotipos con recorridos de luz.
- Rótulos con narrativas, por ejemplo volcán → explosión → aparición de marca.
- Stands de feria.
- Exhibidores promocionales y mobiliario de punto de venta.
- Vitrinas y showrooms.
- Activaciones de marca mediante sensores o botones.
- Elementos arquitectónicos y decorativos de marca.
- Campañas estacionales: Navidad, 15 de septiembre, lanzamientos o promociones.

Una instalación puede almacenar varias escenas y cambiar entre ellas remotamente, sin sustituir el controlador ni recompilar firmware.

---

## 5. Hardware decidido

### 5.1 Controlador

- Microcontrolador: **ESP32**.
- Protocolo/tira inicial: **WS2812B**.
- Cada controlador posee **tres salidas físicas de datos**.
- En este repo, cada salida se representa como un valor lógico `1`, `2` o `3` en la cadena.
- En el firmware externo, cada salida corresponde a un pin de datos y controla una cadena serial de LEDs.
- Cada cadena puede dividirse en múltiples segmentos lógicos.

```text
Controlador ESP32
├── Cadena 1 → WS2812B serial → LED 0…N
├── Cadena 2 → WS2812B serial → LED 0…N
└── Cadena 3 → WS2812B serial → LED 0…N
```

Una cadena puede estar físicamente cortada y unida mediante cables sin LEDs, pero continúa siendo una sola secuencia de direccionamiento mientras comparta la misma salida de datos.

### 5.2 Restricciones que el software debe contemplar

- Orden serial de los píxeles.
- Dirección de datos.
- Cantidad máxima de LEDs por salida.
- Tasa de actualización dependiente de la longitud de cada cadena.
- Corriente estimada y límite global de brillo.
- Fuentes e inyección de corriente.
- Diferencias de longitud entre las tres salidas.
- Sincronización de las tres cadenas mediante un reloj lógico común.

Los pines exactos, modelo de placa, librería LED y toolchain se documentan en el ambiente externo de firmware. Este repo solo debe conservar los límites que afecten directamente la validación de la partitura, como outputs permitidos, LEDs máximos por salida o brillo máximo seguro.

---

## 6. Modelo de dominio

### 6.1 Jerarquía principal

```text
Proyecto o instalación
├── Controlador
│   ├── Cadena 1
│   │   └── Segmentos
│   ├── Cadena 2
│   │   └── Segmentos
│   └── Cadena 3
│       └── Segmentos
├── Zonas visuales
├── Partituras
│   └── Escenas
```
### `.agent/FILESYSTEM_GUARDRAILS.md`

```
# Filesystem Guardrails for Iluminate

**Status:** project organization guardrails  
**Applies to:** `/srv/iluminate`  
**Purpose:** keep the monorepo understandable as services, APIs, partitura contracts, editor and simulator evolve.

---

## 1. Meaning of `services`

In this repository, `services` means a bounded product capability or functional domain.

A service may be:

- a deployable runtime,
- an API surface,
- a shared domain core,
- firmware contract notes,
- a UI application,
- a simulator,
- or a protocol boundary.

Do not assume that every directory under `services/` is a daemon.

---

## 2. Current Service Ownership

```text
services/
  web/iluminate      # Next.js UI and authoring surface
  lighting-core      # LED choreography domain and partitura model
  auth               # identity and authorization domain
  simulator          # reusable simulation domain, when it outgrows web
  device-protocol    # controller/cloud communication contracts
  firmware           # notes for the external ESP32 firmware interpreter
```

### `services/web/iluminate`

Owns:

- Next.js routes and layouts.
- React UI components.
- Canvas and timeline presentation.
- User-facing screens.
- Calls to auth and lighting APIs.

Does not own:

- authoritative partitura schema,
- authorization rules,
- project revision validation,
- controller protocol rules,
- firmware-specific LED drivers.

### `services/lighting-core`

Owns:

- chains,
- segments,
- zones,
- partituras,
- scenes,
- tracks,
- clips,
- effect contracts,
- partitura validation,
- project revisions,
- deployment payload rules,
- LED-domain API handlers if needed.

Does not own:

- login,
- password recovery,
- session cookies,
- organization billing,
- React component state,
- ESP32 hardware drivers.

### `services/auth`

Owns:

- users,
- organizations,
- memberships,
- roles,
- permissions,
- sessions/tokens,
- invitations,
- password recovery,
- auth audit.

Does not own:

- LED project structure,
- partituras,
- controller state,
- deployment rules,
- simulator behavior.

### `services/simulator`

Owns reusable simulation logic after it becomes independent from the first web prototype.

The simulator must interpret the same partitura semantics as firmware. It should not introduce a second authoring model.

### `services/device-protocol`

Owns communication contracts between cloud services and controllers:

- provisioning payloads,
- desired state,
- reported state,
- command revisions,
- firmware/core version checks,
- polling or transport contracts.

### `services/firmware`

Owns only notes and contracts needed by the external ESP32 firmware interpreter.

The compiled firmware source, Arduino/PlatformIO/ESP-IDF project, build scripts and hardware drivers live outside this monorepo. Do not add ESP32 build targets here unless the repository boundary is intentionally changed.

---

## 3. Dependency Direction

Preferred direction:

```text
web/iluminate
  -> auth/contracts
  -> lighting-core/contracts
  -> lighting-core/schemas

lighting-core/api
  -> lighting-core/domain
  -> lighting-core/validators
  -> lighting-core/storage
  -> auth/contracts, when identity context is needed

simulator
  -> lighting-core/domain
  -> lighting-core/schemas

device-protocol
  -> lighting-core/contracts, only for exported partitura/deployment shapes

external firmware environment
  -> documented partitura schema/contracts
```

Avoid:

- `lighting-core` importing React or Next.js.
- `auth` importing lighting domain internals.
- `web/iluminate` becoming the source of truth for partituras.
- API handlers duplicating validation rules that belong in `validators/`.
- simulator storing its own incompatible partitura format.

---

## 4. Domain Vocabulary Is Stable

Use the same names in UI, API, JSON, validators and the external firmware interpreter:

- `chain`
- `segment`
- `zone`
- `partitura`
- `scene`
- `track`
- `clip`
- `effect`
- `controller`
- `deployment`
```

## Reglas Operativas

### `.agent/RULES.md`

```
# RULES

## 1. Fuente de verdad de contexto

Precondicion recomendada al iniciar cada nueva sesion:

1. Carga base:
   - Leer `.agent/RULES.md`.
   - Leer `.agent/EXECUTION_MAP.md`.
   - Leer `.agent/FILESYSTEM_GUARDRAILS.md`.
   - Leer `.agent/IMPLEMENTATION_PLAN.md` cuando la tarea afecte roadmap, fases o priorizacion.
   - Leer `.agent/ILUMINATE_UI_STANDARDS.md` si se toca `services/web/iluminate`.
   - Leer `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md` para decisiones de producto/dominio.
2. Determinar si se requiere regeneracion de contexto:
   - faltan `.agent/BRAIN_MAP.md` o `.agent/AI_CONTEXT_PACK.md`;
   - el commit actual difiere del registrado en `.agent/BRAIN_MAP.md`;
   - el usuario pide actualizacion completa de contexto;
   - hubo cambio grande de arquitectura, compose o estructura de `services/`.
3. Solo si aplica el punto 2, ejecutar `bash .agent/regenerar_contexto.sh`.
4. Leer `BRAIN_MAP` y `AI_CONTEXT_PACK` solo por secciones necesarias.
5. Recien despues iniciar implementacion, debug o review.

Regla de precedencia:

1. Codigo ejecutable vigente.
2. `.agent/RULES.md`.
3. `.agent/FILESYSTEM_GUARDRAILS.md`.
4. `.agent/EXECUTION_MAP.md`.
5. `.agent/IMPLEMENTATION_PLAN.md`.
6. `.agent/ILUMINATE_UI_STANDARDS.md`.
7. `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md`.
8. `.agent/BRAIN_MAP.md`.
9. `.agent/AI_CONTEXT_PACK.md`.

## 2. Scope operativo actual

Servicios principales:

- `services/web/iluminate`: frontend Next.js, shell, UI, editor y simulador inicial.
- `services/lighting-core`: dominio LED, partitura, schemas, validadores, API del dominio y persistencia futura.
- `services/auth`: identidad, organizaciones, membresias, roles, permisos, sesiones y auth API.
- `services/simulator`: simulacion reusable cuando salga del primer prototipo web.
- `services/device-protocol`: contratos cloud/controlador.
- `services/firmware`: notas de contrato con el firmware externo; no contiene el build ESP32.

## 3. Arquitectura innegociable

- El core compilado define capacidades; la partitura define la instalacion.
- No crear firmware distinto por instalacion.
- `lighting-core` es la fuente de verdad del dominio LED.
- `web/iluminate` no debe conectarse directo a Postgres ni poseer reglas canonicas de la partitura.
- `auth` no debe depender de detalles internos del dominio LED.
- Este repo produce y valida partituras; el firmware ESP32 que interpreta esas partituras se construye fuera de este monorepo.
- En este repo solo se modelan tres salidas logicas del controlador: `chain.output` 1, 2 y 3.
- El sistema es multitenant por diseno. La notacion canonica de tenant en PostgreSQL/backend es `client_id`, alineada con el auth copiado desde `datasyncsa`.
- PostgreSQL es la base de datos objetivo para persistencia de auth, proyectos, controladores, revisiones de partitura, despliegues y estado.
- Mantener separados modelo fisico (`chain`, `segment`) y modelo visual (`zone`).
- Preferir contratos claros entre servicios: API, schemas, DTOs y fixtures versionados.

## 4. Seguridad y entorno

Preflight para tareas con DB/Docker/env:

- Validar variables criticas por nombre, sin volcar secretos.
- Prohibido hacer `cat .env` completo salvo instruccion explicita del usuario.
- Para comandos que necesiten `.env`, usar patron:
  `set -a; source .env; set +a; <comando>`
- Si falta una variable critica, detener ejecucion y reportar.

Reglas:

- Credenciales por variables de entorno; nunca hardcodeadas.
- Logout y mutaciones por POST, no por GET/Link.
- Permisos autoritativos en backend/auth.
- No confiar en tenant/organizacion/rol enviados libremente desde el frontend.
- Resolver `client_id` desde sesion, credenciales de dispositivo o contexto backend confiable; nunca desde un campo libre enviado por UI como autoridad.

## 5. Datos y APIs

- APIs viven dentro del servicio que posee el dominio.
- `services/auth/api` administra identidad y permisos.
- `services/lighting-core/api` administra proyectos LED, revisiones, validaciones, despliegues y estado de controlador.
- Los modelos persistentes de negocio deben incluir `client_id` desde el primer diseno de tablas, aunque las pantallas multitenant se implementen mas adelante.
- Next API routes en `services/web/iluminate/app/api` son adaptadores UI o placeholders temporales.
- Si una ruta Next empieza a tener reglas de dominio, mover la regla al service propietario.

## 6. Frontend Iluminate

- Seguir `.agent/ILUMINATE_UI_STANDARDS.md`.
- Preservar `AppShell`, `Sidebar`, `Topbar` y UI primitives existentes.
- No introducir templates externos.
- No construir landing marketing dentro del portal operativo.
- El editor debe usar el vocabulario del core: chain, segment, zone, partitura, scene, track, clip, effect.
- Mocks locales deben estar explicitamente marcados.

## 7. Infra y operacion

- Compose operativo actual: `compose.yml`.
- Servicio web actual: `iluminate-web`.
- Puerto local por defecto: `8420`.
- No cambiar nombres de servicios, puertos o URLs base sin ajustar:
  - `compose.yml`;
  - `.env.example`;
  - `.agent/*` relevante;
  - README del servicio afectado.

## 8. Testing minimo por cambio

- Usar `.agent/EXECUTION_MAP.md` para decidir validacion.
- Si cambias `services/web/iluminate`, validar con Docker build/smoke cuando sea posible.
- Si cambias `compose.yml`, ejecutar `docker compose config`.
- Si cambias scripts shell, ejecutar `bash -n`.
- Si no se ejecutan pruebas, documentar exactamente que no se valido y por que.

## 9. Checklist de rechazo inmediato

Rechazar o detener cambios que:

- convierten el producto en editor vectorial general;
- copian WLED como modelo de producto;
- descargan codigo arbitrario al ESP32;
- hacen del web la fuente canonica de la partitura;
- mezclan auth/sesiones dentro de `lighting-core`;
- mezclan drivers ESP32 dentro del web o dentro del monorepo;
- conectan frontend directo a Postgres;
- eliminan validaciones de seguridad;
- dejan `.agent`, `.env.example` o compose desalineados.

## 10. Convencion de trabajo con IA

Antes de empezar trabajo nuevo:

1. Aplicar seccion 1.
2. Identificar servicio propietario.
3. Consultar solo el contexto necesario.
4. Hacer cambios pequenos y verificables.
5. Mantener los documentos `.agent` alineados cuando cambie arquitectura, compose o convenciones.

Si aparece una instruccion heredada de otro proyecto, tratarla como legacy y no aplicarla a Iluminate salvo pedido explicito.
```
### `.agent/EXECUTION_MAP.md`

```
# Execution Map

## Objetivo

Este archivo define donde validar cambios segun la ruta afectada. En Iluminate, `services` representa unidades funcionales del monorepo; no todos son runtimes.

## Reglas base

1. Si el codigo corre en un contenedor existente, validar con Docker/Compose.
2. Si el servicio aun es esqueleto, usar validaciones livianas.
3. Si el servicio Docker copia codigo en imagen, hacer rebuild antes del smoke final.
4. No leer `.env` completo ni volcar secretos. Validar solo nombres de variables necesarias.
5. Si no se puede validar, reportar exactamente que falto y por que.

## Mapa por rutas

| Ruta | Validacion preferida | Comando base |
|---|---|---|
| `compose.yml` | Sintaxis compose | `docker compose config` |
| `.env.example` | Alineacion con compose y docs | revision manual |
| `.agent/*.md` | Revision de contenido | no requiere runtime |
| `.agent/*.sh` | Sintaxis shell | `bash -n .agent/<script>.sh` |
| `services/web/iluminate/` | Build/smoke de Next via Docker | `docker compose build iluminate-web` y `curl -I http://localhost:${ILUMINATE_WEB_PORT:-8420}` si esta levantado |
| `services/lighting-core/` | Build y fixtures del dominio | `docker run --rm -v "$PWD/services/lighting-core:/work" -w /work node:22-alpine sh -c "npm ci && npm test"` |
| `services/auth/` | Por ahora docs/estructura; futuro tests/API auth | no aplica hasta tener runtime |
| `services/simulator/` | Por ahora docs/estructura; futuro tests deterministas | no aplica hasta tener runtime |
| `services/device-protocol/` | Contratos y fixtures; futuro tests de schema | no aplica hasta tener runtime |
| `services/firmware/` | Revision de notas/contrato externo; no build ESP32 en este repo | no aplica |

## Variables clave actuales

- `ILUMINATE_WEB_PORT`
- `ILUMINATE_API_BASE_URL`
- `ILUMINATE_PLACEHOLDER_AUTH`
- `ILUMINATE_SECURE_COOKIES`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `DB_PORT`
- `ILUMINATE_DATABASE_URL`

Variables previstas:

- `ILUMINATE_REDIS_URL`
- `ILUMINATE_SECRET_KEY`
- `ILUMINATE_INTERNAL_TOKEN`

## Checklist operativo minimo

1. Identificar ruta del cambio.
2. Confirmar servicio propietario.
3. Ejecutar validacion minima aplicable.
4. Si cambia compose/env/docs, mantenerlos alineados.
5. Reportar validacion ejecutada o limitacion concreta.
```
### `.agent/IMPLEMENTATION_PLAN.md`

```
# Iluminate Implementation Plan

**Status:** living execution plan  
**Purpose:** track progress toward the full Iluminate platform without losing the vertical proof goal.  
**Rule:** update this document whenever a phase is completed, materially changed, or split.

---

## Guiding Goal

An ally can design a segmented LED installation, author and simulate a partitura, publish it remotely, and have an ESP32 controller execute it without recompiling firmware.

The product is not complete until this loop works:

```text
physical installation model
→ partitura authoring
→ simulation
→ validation
→ deployment
→ ESP32 execution
→ reported status
→ rollback or scene change
```

---

## Phase 0: Partitura Hardware Boundary

**Objective:** lock the hardware abstraction used by the repo without moving firmware build work into the repo.

### Deliverables

- [x] Treat ESP32 firmware implementation as external to this repo.
- [x] Limit repo hardware modeling to three logical chain outputs: `1`, `2` and `3`.
- [x] Document the `chain.output` contract in `services/lighting-core`.
- [x] Document that board pins map to outputs in the external firmware project, not in this repo.
- [ ] Document power input, protection and wiring assumptions as non-authoritative notes if useful for users.
- [x] Document LED protocol only as an external firmware note when it matters for compatibility.
- [x] Keep physical LED counts, pin maps and brightness outside application environment variables.
- [ ] Measure realistic FPS by chain length in the external firmware environment when needed.
- [ ] Document firmware framework only as an external environment note when known.

### Exit Criteria

- [ ] `lighting-core` can validate that chains use only outputs `1`, `2` and `3`.
- [ ] The repo does not contain ESP32 firmware source or build scripts.
- [ ] The partitura model stays independent from concrete ESP32 pins, FastLED arrays and brightness constants.

---

## Phase 1: Lighting Core Domain

**Objective:** create the canonical partitura model before the UI owns any domain rules.

### Deliverables

- [x] Define TypeScript domain types under `services/lighting-core`.
- [x] Define versioned partitura schema.
- [x] Model `chain` with `output` constrained to `1`, `2` or `3`.
- [x] Model `segment`.
- [x] Model `zone`.
- [x] Model `scene`.
- [x] Model `track`.
- [x] Model `clip`.
- [x] Model `effect` contract/metadata.
- [x] Add fixtures for small deterministic installations.
- [x] Validate missing references.
- [x] Validate segment ranges outside chains.
- [x] Validate overlapping segment ranges.
- [x] Validate empty zones.
- [x] Validate unsupported effects.
- [x] Validate required core version.
- [x] Export readable JSON partitura.

### Exit Criteria

- [x] A hand-written partitura validates successfully.
- [x] Invalid fixtures produce deterministic, human-readable validation errors.
- [x] `services/web/iluminate` can consume types/contracts without owning the model.

---

## Phase 2: External Firmware Compatibility

**Objective:** prove that an external ESP32 firmware environment can execute a validated partitura produced by this repo.

### Deliverables

- [x] Export a validated JSON partitura fixture from `services/lighting-core`.
- [x] Document how the external firmware should consume `chain.output` values 1, 2 and 3.
- [x] Document supported effect identifiers and parameters as contracts.
- [ ] Keep firmware source, build scripts and hardware drivers outside this repo.
- [x] Capture compatibility notes in `services/firmware/README.md` without adding a firmware project.
- [x] Add a WS2812B-like web/core simulator before firmware implementation.

### Exit Criteria

- [ ] An external ESP32 firmware build can load a fixture produced by this repo.
- [ ] Changing timing/colors/zones requires partitura update only, not firmware rebuild.
- [ ] This repo remains the producer/validator of partitura artifacts, not the firmware source tree.

---

## Phase 3: Technical Web Editor

**Objective:** let a professional model a physical LED installation from the browser.

### Deliverables

- [ ] Align `services/web/iluminate` navigation with Iluminate domain.
- [ ] Add Projects placeholder.
- [ ] Add Project Editor route.
- [ ] Add image/render/plan upload placeholder.
- [ ] Add canvas area.
- [ ] Add scale calibration tool.
- [ ] Add rulers/grid.
- [ ] Draw up to three chains.
- [ ] Show data direction.
- [ ] Represent wire jumps without LEDs.
- [ ] Calculate LED points by density/length.
- [ ] Show LED indices.
- [ ] Create segments from ranges.
- [ ] Create zones from segments.
- [ ] Export partitura through `lighting-core`.

### Exit Criteria

- [ ] A user can model a small sign with chains, segments and zones.
- [ ] The web editor stores domain data outside any private Konva format.
- [ ] Exported partitura passes `lighting-core` validation.

---

## Phase 4: Timeline and Simulator

**Objective:** let the user author, preview and approve a coordinated lighting narrative.

### Deliverables

- [ ] Add scenes.
- [ ] Add tracks targeting zones.
- [ ] Add clips to tracks.
- [ ] Move clips in time.
- [ ] Resize clip duration.
- [ ] Edit effect parameters.
- [ ] Add scene loop.
- [ ] Add playback head.
- [ ] Simulate LEDs over the uploaded image.
- [ ] Support layers minimally.
- [ ] Support at least `replace` blend.
- [ ] Add deterministic simulator fixtures.
- [ ] Compare web simulator output against expected effect cases.

### Exit Criteria

- [ ] A user can create a short scene and preview it.
- [ ] Simulation uses the same partitura semantics as firmware.
- [ ] At least the initial five effects have deterministic reference cases.

---

## Phase 5: Deployment and Device Protocol

**Objective:** publish partituras and scene changes remotely while the device remains autonomous.

### Deliverables

- [ ] Define device identity contract.
- [ ] Define provisioning placeholder.
- [ ] Define desired partitura revision.
- [ ] Define desired scene command.
- [ ] Define reported device status.
- [ ] Implement controller polling contract.
- [ ] Store active and previous partitura on device.
- [ ] Validate checksum before activation.
- [ ] Apply partitura revision.
- [ ] Activate scene without full partitura change.
- [ ] Report applied command revision.
- [ ] Implement rollback path.
```
### `.agent/ILUMINATE_UI_STANDARDS.md`

```
# Iluminate UI Standards

Documento obligatorio para cualquier trabajo en `services/web/iluminate`.

Este archivo existe para mantener la interfaz consistente mientras el producto evoluciona desde shell placeholder hacia editor tecnico de instalaciones LED.

## 1. Principio rector

Iluminate es una herramienta B2B tecnica para profesionales de rotulos, stands y mobiliario comercial.

Orden de decision:

1. Auditar lo existente.
2. Reutilizar componentes existentes.
3. Extender patrones existentes.
4. Crear componentes pequenos solo si falta una pieza reusable.
5. Implementar pantalla por pantalla.

No regenerar el portal desde cero ni introducir templates externos.

## 2. Arquitectura frontend

Estructura esperada:

- `app`: rutas, layouts de Next y composicion de paginas.
- `components/ui`: primitivos reutilizables sin conocimiento de dominio.
- `components/portal`: shell, navegacion, topbar, sidebar y composicion general.
- `components/lighting`: componentes especificos del dominio LED, cuando se creen.
- `components/editor`: canvas, herramientas de cadena, segmento y zona, cuando se creen.
- `components/timeline`: escenas, pistas y clips, cuando se creen.
- `lib`: clientes API, helpers, tipos de UI y mocks temporales explicitamente marcados.

Reglas:

- El frontend no debe conectarse directo a Postgres.
- Todo dato real debe venir de APIs/contratos del servicio propietario.
- Los mocks deben estar marcados como temporales.
- El web no debe ser la fuente de verdad de la partitura; debe consumir `lighting-core`.

Idioma de UI:

- Usar ingles por defecto para copy visible del producto, salvo que se pida una variante localizada.
- Mantener terminos de dominio estables: chain, segment, zone, partitura, scene, track, clip, effect, controller, deployment.
- `partitura` es el termino oficial del dominio. No usar `score` como sinonimo en UI, API, JSON, codigo ni documentacion.

## 3. Componentes existentes a preservar

No borrar, reemplazar o duplicar sin justificacion:

- `components/portal/app-shell.tsx`
- `components/portal/sidebar.tsx`
- `components/portal/topbar.tsx`
- `components/portal/module-view.tsx`
- `components/portal/role-simulator.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/modal.tsx`
- `components/ui/alert.tsx`
- `components/ui/tabs.tsx`
- `components/ui/theme-toggle.tsx`
- `components/ui/empty-state.tsx`
- `components/ui/loading-state.tsx`

Antes de crear un componente nuevo, buscar si una pieza existente cubre el caso.

## 4. Sistema visual

Look esperado:

- B2B enterprise.
- Sobrio, denso, profesional.
- Orientado a trabajo tecnico y revision visual.
- Claro para usuarios que conocen fabricacion e instalacion.

Permitido:

- Canvas tecnico con reglas, escala, grid, indices y snapping.
- Tablas, formularios, filtros, detalle, estados y acciones explicitas.
- Iconos funcionales.
- Light/dark con tokens existentes.

Evitar:

- Hero sections dentro del portal autenticado.
- Gradientes decorativos.
- Fondos ornamentales.
- Cards decorativas sin proposito operativo.
- Paletas distintas por pantalla.
- Texto visible excesivo explicando patrones obvios.

## 5. Tema light/dark

- Usar `ThemeToggle`.
- Persistir preferencia con el mecanismo existente.
- Evitar flashes visuales al cargar tema.
- Extender `app/globals.css` y `tailwind.config.ts` si falta un token.
- No crear variantes dark/light manuales por pantalla si el token resuelve el caso.

## 6. Editor LED

El editor no es Illustrator ni Figma.

Herramientas esperadas:

- Cargar imagen, render o plano.
- Calibrar escala.
- Mostrar reglas en mm/cm.
- Zoom, paneo, grid y snapping.
- Dibujar chains por salida fisica.
- Mostrar direccion de datos.
- Marcar saltos sin LEDs.
- Calcular puntos LED e indices.
- Crear segments desde rangos.
- Crear zones que agrupen segments.

El formato principal no debe ser JSON privado de Konva ni de una libreria de timeline.

## 7. Timeline y simulacion

La timeline debe usar el vocabulario de la partitura:

- scenes
- tracks
- clips
- effects
- layers
- blend modes

La simulacion debe interpretar la misma semantica que firmware. Si hay efectos duplicados en TypeScript y C++, deben existir pruebas deterministas o fixtures comunes.

## 8. Estados, errores y feedback

Nunca mostrar JSON crudo al usuario final.

Usar:

- `Alert` para error, warning, success e info.
- `EmptyState` para ausencia de datos.
- `LoadingState` para carga.
- `lib/feedback.ts` para normalizar mensajes.

Los errores no deben exponer SQL, tokens, trazas ni payloads sensibles.

## 9. Seguridad, auth y permisos

La seguridad autoritativa vive en backend/auth.

Reglas:

- Logout siempre por POST/form, no `Link` ni GET.
- No pasar rol activo, organizacion o tenant por query string como autoridad.
- Ocultar/deshabilitar acciones sin permiso, pero la API debe validar tambien.
- `lighting-core` debe recibir identidad/contexto resuelto; no manejar contrasenas ni sesiones.

## 10. Mocks y contratos API

Mientras una API no este completa:

- Marcar mocks como temporales.
- No mezclar mocks silenciosos con datos reales.
- No simular exito persistente si la API no guarda.
- Mantener acciones deshabilitadas o feedback claro cuando falte contrato.

## 11. Dependencias UI

No instalar librerias visuales grandes sin justificar.

Permitido con criterio:

- React Konva para canvas de autoria.
- PixiJS si el simulador lo requiere.
- Librerias funcionales pequenas.
- Iconos de la libreria ya presente.

No permitido:

- Templates UI externos.
- Kits completos que reemplacen el sistema actual.
- Dependencias que impongan una estetica ajena.
```
### `.agent/ILUMINATE_BOOTSTRAP.md`

```
# Iluminate Bootstrap

Este archivo resume el foco operativo actual. Las reglas autoritativas viven en `.agent/RULES.md`.

## Foco

- `services/lighting-core`: dominio LED, partitura, validacion, revisiones y contratos de despliegue.
- `services/auth`: identidad, organizaciones, miembros, roles, permisos y sesiones.
- `services/web/iluminate`: interfaz Next.js para autoria, operacion y administracion.
- `services/simulator`: dominio reusable de simulacion cuando salga del prototipo web.
- `services/device-protocol`: contratos cloud/controlador.
- `services/firmware`: notas de contrato con el firmware externo; no contiene el build ESP32.

## Principio de separacion

El modelo de dominio vive en `lighting-core`. El web presenta, edita y consume contratos. Auth resuelve identidad y permisos. Este repo produce y valida partituras; el firmware ESP32 que las interpreta se construye fuera de este monorepo.

En lo que concierne a este repo, el hardware se modela como un controlador con exactamente tres salidas logicas: `chain.output` 1, 2 y 3.

El sistema es multitenant por diseno. La notacion canonica de tenant en PostgreSQL/backend es `client_id`, alineada con el auth copiado desde `datasyncsa`. PostgreSQL es la base de datos objetivo.

## No convertir

- No convertir Iluminate en editor vectorial general.
- No convertirlo en copia de WLED.
- No crear firmware distinto por instalacion.
- No hacer que el web sea fuente de verdad de la partitura.
- No meter login/sesiones dentro de `lighting-core`.
```

## Compose y Variables

### Servicios del compose principal

```text
iluminate-web
postgres
```
### `compose.yml:1-220`

```
name: iluminate

services:
  postgres:
    image: postgres:17-alpine
    container_name: iluminate-postgres
    restart: unless-stopped
    command: ["postgres", "-c", "timezone=${TZ:-UTC}"]
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: ${DB_NAME}
      TZ: ${TZ:-UTC}
    ports:
      - "${DB_PORT:-5433}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  iluminate-web:
    build:
      context: .
      dockerfile: services/web/iluminate/Dockerfile
    image: iluminate-web:dev
    container_name: iluminate-web
    environment:
      ILUMINATE_API_BASE_URL: ${ILUMINATE_API_BASE_URL:-}
      ILUMINATE_PLACEHOLDER_AUTH: ${ILUMINATE_PLACEHOLDER_AUTH:-true}
      ILUMINATE_SECURE_COOKIES: ${ILUMINATE_SECURE_COOKIES:-false}
    ports:
      - "${ILUMINATE_WEB_PORT:-8420}:3000"
    restart: unless-stopped

networks:
  default:
    name: iluminate-net

volumes:
  postgres_data:
```
### `.env.example`

```
# Iluminate environment example
# Copy to .env and fill values as services are introduced.

ILUMINATE_ENV=local
ILUMINATE_WEB_PORT=8420
ILUMINATE_PUBLIC_APP_URL=http://localhost:8420

# Web/API
ILUMINATE_API_BASE_URL=
ILUMINATE_PLACEHOLDER_AUTH=true
ILUMINATE_SECURE_COOKIES=false

# PostgreSQL
DB_USER=acartin
DB_PASS=change-me
DB_NAME=iluminate
DB_PORT=5433
ILUMINATE_DATABASE_URL=postgresql://acartin:change-me@postgres:5432/iluminate
ILUMINATE_REDIS_URL=
ILUMINATE_SECRET_KEY=change-me
ILUMINATE_INTERNAL_TOKEN=change-me
```

## Topologia

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
services/web/iluminate/public
```

## Archivos

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
```

## Extractos de Servicio

### `services/README.md`

```
# Iluminate Services

In this monorepo, `services` means product capability or bounded domain. A service may be a runtime, an API, a shared domain core, contract notes, or a UI surface.

Current service map:

- `web/iluminate`: Next.js operator and authoring interface.
- `lighting-core`: LED installation, partitura, scene, simulator-facing and deployment-domain core.
- `auth`: identity, organizations, memberships, roles, sessions and authorization contracts.
- `firmware`: notes for the external ESP32 firmware interpreter; not a firmware build target.
```
### `services/web/iluminate/README.md`

```
# Iluminate Web

Basic web console for Iluminate, cloned from the Voxalia Next.js web architecture and theme.

## Responsibility

- Provide the first Iluminate web shell with the same Next.js App Router, API route and Tailwind component structure.
- Keep the authentication architecture in place: login/logout routes, httpOnly session cookie, role simulation and server-side menu contracts.
- Run without a real auth/backend service for now through placeholder auth.
- Expose starter menus and placeholder pages for workspaces, knowledge, automation, channels, insights and settings.

## Current Mode

The app is intentionally UI/API-contract first. With `ILUMINATE_API_BASE_URL` empty and `ILUMINATE_PLACEHOLDER_AUTH=true`, any non-empty username/password opens the console.

When the backend is ready, set:

```text
ILUMINATE_API_BASE_URL=http://iluminate-api:8000/api/v1
ILUMINATE_PLACEHOLDER_AUTH=false
ILUMINATE_SECURE_COOKIES=true
```

Expected backend endpoints keep the same shape as Voxalia:

```text
POST /auth/login
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/simulate-role
GET  /menu
GET  /{module-path}
```

## Local Development

```bash
npm install
npm run dev
```

From `/srv/iluminate`, the container placeholder can be built with:

```bash
docker compose up --build iluminate-web
```
```
### `services/web/iluminate/package.json`

```
{
  "name": "iluminate-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 0.0.0.0 --port 3000",
    "build": "next build",
    "start": "next start --hostname 0.0.0.0 --port 3000",
    "lint": "next lint"
  },
  "dependencies": {
    "@radix-ui/react-slot": "1.1.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "jssip": "^3.13.8",
    "lucide-react": "0.468.0",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1",
    "tailwind-merge": "2.5.5"
  },
  "devDependencies": {
    "@types/node": "20.17.12",
    "@types/react": "19.2.8",
    "@types/react-dom": "19.2.3",
    "autoprefixer": "10.4.20",
    "eslint": "9.39.2",
    "eslint-config-next": "16.2.6",
    "postcss": "8.5.10",
    "tailwindcss": "3.4.17",
    "typescript": "5.7.2"
  },
  "overrides": {
    "postcss": "8.5.10"
  }
}
```
### `services/web/iluminate/lib/api.ts`

```
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MenuItem, MenuPayload, MenuSection, ModulePayload, Role, WorkspacePayload } from "@/lib/types";

export const API_BASE_URL = process.env.ILUMINATE_API_BASE_URL ?? "";
export const placeholderAuthEnabled = process.env.ILUMINATE_PLACEHOLDER_AUTH !== "false" && !API_BASE_URL;
export const sessionCookieName = "iluminate_session";
export const placeholderRoleCookieName = "iluminate_placeholder_role";
export const defaultAuthenticatedPath = "/settings/clients";

export const roleLabels: Record<Role, string> = {
  "system-admin": "System admin",
  "system-user": "System user",
  "client-admin": "Client admin",
  "client-viewer": "Client viewer"
};

export const roleOrder: Role[] = ["system-admin", "system-user", "client-admin", "client-viewer"];

export const permissionsByRole: Record<Role, string[]> = {
  "system-admin": ["*"],
  "system-user": ["lighting:projects:read", "lighting:partituras:read", "device:controllers:read", "audit:events:read"],
  "client-admin": [
    "auth:users:manage",
    "lighting:projects:read",
    "lighting:projects:manage",
    "lighting:partituras:read",
    "lighting:partituras:manage",
    "lighting:deployments:manage",
    "device:controllers:read",
    "device:controllers:manage"
  ],
  "client-viewer": ["lighting:projects:read", "lighting:partituras:read", "device:controllers:read"]
};

export const menuCatalog: MenuSection[] = [
  {
    id: "partituras",
    label: "Lighting",
    items: [
      {
        id: "partitura-generator",
        label: "Partitura Generator",
        href: "/partituras/generator",
        description: "Internal generator and validation workbench for partitura.v1.",
        required_permission: "lighting:partituras:manage"
      }
    ]
  },
  {
    id: "settings",
    label: "Auth",
    items: [
      {
        id: "clients",
        label: "Clients",
        href: "/settings/clients",
        description: "Client records used as the tenant boundary for Iluminate.",
        required_permission: "auth:clients:manage"
      },
      {
        id: "users",
        label: "Users",
        href: "/settings/users",
        description: "User lifecycle and membership architecture reserved for backend auth.",
        required_permission: "auth:users:manage"
      },
      {
        id: "roles",
        label: "Roles",
        href: "/settings/roles",
        description: "Roles, grants and authorization policy placeholders.",
        required_permission: "auth:roles:manage"
      },
      {
        id: "audit",
        label: "Audit Log",
        href: "/settings/audit",
        description: "Auth and operational audit trail.",
        required_permission: "audit:events:read"
      }
    ]
  }
];

export function isRole(value: string): value is Role {
  return roleOrder.includes(value as Role);
}

export function canAccess(role: Role, item: MenuItem) {
  const permissions = permissionsByRole[role];
  return permissions.includes("*") || (item.required_permission ? permissions.includes(item.required_permission) : true);
}

export function menuForRole(role: Role): MenuSection[] {
  return menuCatalog
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(role, item))
    }))
    .filter((section) => section.items.length > 0);
}

export function roleCanAccessPath(role: Role, path: string) {
  return menuForRole(role).some((section) => section.items.some((item) => item.href === path));
}

export function defaultPathForRole(role: Role) {
  return menuForRole(role)[0]?.items[0]?.href ?? defaultAuthenticatedPath;
}

const defaultPlaceholderRole: Role = "system-admin";

function placeholderMenuForRole(role: Role): MenuPayload {
  return {
    user: {
      id: "placeholder-user",
      email: "admin@iluminate.local",
      role,
      role_label: roleLabels[role]
    },
    tenant: {
      client_id: "iluminate",
      name: "Iluminate",
      mode: "placeholder"
    },
    auth: {
      provider: placeholderAuthEnabled ? "placeholder" : "iluminate-api",
      status: placeholderAuthEnabled ? "placeholder" : "active",
      can_simulate_roles: placeholderAuthEnabled,
      is_role_simulated: role !== defaultPlaceholderRole
    },
    sections: menuForRole(role)
  };
}

export const placeholderMenu: MenuPayload = placeholderMenuForRole(defaultPlaceholderRole);

async function authHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) redirect("/login");

  return {
    Authorization: `Bearer ${token}`
  };
}

async function getJson<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("ILUMINATE_API_BASE_URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: await authHeaders(),
    cache: "no-store"
  });

  if (response.status === 401) redirect("/login");
  if (response.status === 403) redirect(defaultAuthenticatedPath);

  if (!response.ok) {
    throw new Error(`Iluminate API error ${response.status} on ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function getMenu(): Promise<MenuPayload> {
  if (placeholderAuthEnabled) {
    const cookieStore = await cookies();
    if (!cookieStore.get(sessionCookieName)?.value) redirect("/login");
    const requestedRole = cookieStore.get(placeholderRoleCookieName)?.value ?? defaultPlaceholderRole;
    const role = isRole(requestedRole) ? requestedRole : defaultPlaceholderRole;
    return placeholderMenuForRole(role);
  }

  return getJson<MenuPayload>("/menu");
}

```
### `services/web/iluminate/lib/modules.ts`

```
export const moduleEndpointByPath: Record<string, string> = {
  "/console/overview": "/console/overview",
  "/console/activity": "/console/activity",
  "/workspaces/hub": "/workspaces/hub",
  "/workspaces/projects": "/workspaces/projects",
  "/workspaces/tasks": "/workspaces/tasks",
  "/knowledge/documents": "/knowledge/documents",
  "/knowledge/collections": "/knowledge/collections",
  "/automation/flows": "/automation/flows",
  "/automation/agents": "/automation/agents",
  "/channels/inboxes": "/channels/inboxes",
  "/channels/integrations": "/channels/integrations",
  "/insights/reports": "/insights/reports",
  "/insights/quality": "/insights/quality",
  "/settings/clients": "/settings/clients",
  "/settings/workspaces": "/settings/workspaces",
  "/settings/users": "/settings/users",
  "/settings/roles": "/settings/roles",
  "/settings/audit": "/settings/audit"
};

export const roleOptions = [
  { id: "system-admin", label: "System admin" },
  { id: "system-user", label: "System user" },
  { id: "client-admin", label: "Client admin" },
  { id: "client-viewer", label: "Client viewer" }
] as const;
```
### `services/lighting-core/README.md`

```
# Lighting Core Service

Functional domain for choreographed addressable LED installations.

This service owns:

- chains
- segments
- zones
- scenes
- tracks
- clips
- effects catalog contracts
- partitura schemas and validation
- project revisions
- controller-facing deployment payloads
- deterministic simulator contracts

It may contain an API under `api/`, pure domain logic under `domain/`, schemas under `schemas/`, persistence under `storage/`, and shared fixtures under `fixtures/`.

Persistent records owned by lighting-core are multitenant by design. Projects, controllers, partitura revisions, deployments, device commands and status records must be scoped by the trusted `client_id` context provided by auth or device identity.

It must not own login, password, sessions, billing, or web component state.

## Hardware Boundary

Partituras model controller chains through logical `chain.output` values only:

- `1`
- `2`
- `3`

The current external ESP32 firmware reference maps those outputs to concrete arrays and pins, but that mapping is documented only as a firmware note in `services/firmware/README.md`.

Lighting-core validators should treat outputs outside `1`, `2` and `3` as invalid. Concrete ESP32 pins, FastLED arrays, LED protocol, brightness and driver setup remain outside the partitura abstraction.

## Current Package Surface

The initial TypeScript package exports:

- `generatePartitura`: builds a normalized `partitura.v1` document from a configuration command.
- `validatePartitura`: returns deterministic, human-readable validation issues.
- `effectCatalog`: declares the first supported compiled-core effect identifiers.
- `renderSceneFrame`: basic deterministic scene renderer for web simulation and firmware parity checks.
- `simulateWs2812bFrame`: WS2812B-like output simulator with per-output buffers, GRB transport order and estimated refresh timing.

The first supported effect identifiers are:

- `off`
- `solid`
- `fade`
- `pulse`
- `chase`

Fixtures live in `fixtures/` and are intended to be reused by the web simulator and the external firmware interpreter.

## WS2812B-Like Simulation Scope

The simulator models the operational behavior useful for Iluminate:

- serial LED order per logical output;
- 8-bit RGB color quantization;
- WS2812B transport order as GRB bytes;
- 24 bits per pixel;
- nominal 1.25 microseconds per bit;
- reset/latch time modeled as 280 microseconds;
- estimated transmit time and maximum refresh rate per output.

It does not simulate waveform pulse widths, voltage drop, power injection, current draw, wire impedance or ESP32 interrupt behavior. Those remain firmware and hardware validation concerns.
```
### `services/auth/README.md`

```
# Auth Service

Functional domain for identity and authorization.

This service owns:

- customers/tenants/organizations
- users
- organizations
- organization memberships
- roles and permissions
- sessions or tokens
- invitations
- password recovery
- auth audit records

It may expose an API under `api/`, persist data through `storage/`, and publish shared contracts through `contracts/`.

The platform is multitenant by design. Auth uses `auth_clients` and `client_id` as the tenant convention copied from `datasyncsa`; that trusted context scopes projects, controllers, partituras and deployments.

It must not own LED installation, partitura, scene, controller or deployment domain rules.
```
### `services/simulator/README.md`

```
# Simulator Service

Reserved functional domain for browser/device-parity simulation.

The first implementation may live inside `web/iluminate`, but simulator logic that becomes reusable should move here instead of being trapped in React components.

The simulator should interpret the same partitura semantics as the ESP32 core.

```
### `services/device-protocol/README.md`

```
# Device Protocol Service

Reserved functional domain for controller provisioning, polling, commands, status and firmware compatibility contracts.

This service should define how cloud services and ESP32 controllers communicate without owning the LED authoring model itself.

```
### `services/firmware/README.md`

```
# Firmware Contract Notes

This directory is reserved for notes that help an external ESP32 firmware project consume Iluminate partituras.

The firmware source, build scripts, Arduino/PlatformIO/ESP-IDF project and hardware drivers live outside this monorepo.

Within this repo, the controller is represented only by three logical chain outputs: `1`, `2` and `3`. Mapping those outputs to concrete ESP32 pins is an external firmware concern.

## Current External Firmware Reference

The first known Arduino/FastLED firmware setup uses WS2812B strips with this mapping:

| Logical output | Firmware array | ESP32 data pin | LEDs |
|---:|---|---:|---:|
| `1` | `rayos` | `25` | `468` |
| `2` | `circulo` | `32` | `152` |
| `3` | `base` | `26` | `120` |

Current firmware brightness reference: `150`.

These values are notes about the current external firmware only. They are not application environment variables, database configuration, or partitura schema fields.

The external firmware project remains the source of truth for concrete pins, LED counts, brightness and driver setup. Iluminate should produce validated partituras against logical outputs `1`, `2` and `3`; it should not embed ESP32 driver code, pin maps, or per-installation firmware source.

## Partitura Compatibility Target

The external firmware interpreter should first target:

- `services/lighting-core/fixtures/partitura-v1-minimal.json`
- schema version: `partitura.v1`
- required core version: `0.1.0`
- logical outputs: `1`, `2`, `3`
- effects: `off`, `solid`, `fade`, `pulse`, `chase`
- blend modes used by the fixture: `replace`, `max`, `add`
- web/core simulator: `simulateWs2812bFrame`

Minimal firmware acceptance checklist:

1. Load the JSON partitura.
2. Reject unsupported `schemaVersion`.
3. Resolve chains by logical `output`, then map those outputs internally to the firmware arrays/pins.
4. Resolve `segment` ranges from chains.
5. Resolve `zone` targets from segments and child zones.
6. Select `defaultScene`.
7. Run clips from a shared scene clock.
8. Apply layers and the supported blend modes.
9. Reject unknown effect identifiers before playback.
10. Keep running locally without requiring cloud access after the partitura is loaded.

The TypeScript simulator models WS2812B-like frame behavior for parity work: serial pixel order, RGB 8-bit values, GRB transport order, 24 bits per pixel, reset/latch delay and estimated refresh timing. It is not a bit-level waveform simulator.
```
