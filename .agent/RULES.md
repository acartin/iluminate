# RULES

## 1. Fuente de verdad de contexto

Precondicion recomendada al iniciar cada nueva sesion:

1. Carga base:
   - Leer `.agent/RULES.md`.
   - Leer `.agent/EXECUTION_MAP.md`.
   - Leer `.agent/FILESYSTEM_GUARDRAILS.md`.
   - Leer `.agent/IMPLEMENTATION_PLAN.md` cuando la tarea afecte roadmap, fases o priorizacion.
   - Leer `.agent/EFFECT_TARGETING_MODEL.md` antes de cambiar el compilador, pixelMap, zonas, grupos, efectos o simulador.
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
- Mantener separados el modelo fisico de cableado (`controller`, data cables, LED strings y nodos de fabricacion) y el modelo visual (`zone`, `group`). Los segmentos/rangos logicos no forman parte del flujo normal del operador; el pixelMap los deriva cuando haga falta.
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
