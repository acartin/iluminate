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
| `services/lighting-core/pixel-map/` | Build core y validar generation/simulation por API si afecta web | `docker compose up -d --build iluminate-web` |
| `services/lighting-core/domain/effects/` | Build core/web y smoke de `/api/lighting/effects`; si cambia renderer, generar frame de Lab por API | `docker compose up -d --build iluminate-web` |
| `services/web/iluminate/components/lighting/partitura-workspace.tsx` | Build Next y smoke manual/API de Partitura Workspace y Effect Lab | `docker compose up -d --build iluminate-web` |
| `services/web/iluminate/components/lighting/partitura-designer-workbench.tsx` | Build Next y smoke manual/API del grid Designer | `docker compose up -d --build iluminate-web` |
| `services/web/iluminate/lib/lighting/partitura-model.ts` | Build Next/core; si cambia Designer defaults, revisar API/DB porque documentos persistidos pueden ocultar cambios | `docker compose up -d --build iluminate-web` |
| `services/auth/` | Por ahora docs/estructura; futuro tests/API auth | no aplica hasta tener runtime |
| `services/simulator/` | Por ahora docs/estructura; futuro tests deterministas | no aplica hasta tener runtime |
| `services/device-protocol/` | Contratos y fixtures; futuro tests de schema | no aplica hasta tener runtime |
| `services/firmware/` | Revision de notas y spikes temporales; el firmware PlatformIO organizado vive fuera de este repo | revision manual; build real en repo firmware externo |
| `docs/` | Revision de documentacion de arquitectura | no requiere runtime |

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

## Smoke recomendado para Effect Lab

Cuando cambien efectos, presets de Lab, `pixelMap` o simulacion:

1. Reconstruir `iluminate-web`.
2. Verificar `/api/lighting/effects`.
3. Generar un frame por API para al menos una matriz `20x15` o un template de letras.
4. Confirmar que el frame contiene coordenadas `x/y`, pixel count esperado y variedad de colores cuando aplique.
5. Si el cambio no toca firmware, indicarlo explicitamente.

## Smoke recomendado para Designer

Cuando cambien canvas, defaults, rutas, snap/soldadura, controlador o persistencia:

1. Ejecutar `git diff --check`.
2. Reconstruir `iluminate-web` con `docker compose up -d --build iluminate-web`.
3. Verificar que `/partituras/designer` liste la partitura activa.
4. Verificar por API que el documento activo esperado sea visible:

```bash
curl -s http://localhost:8420/api/lighting/partituras | jq -r '.records[] | "\(.id) \(.partituraKey) \(.name) \(.status) \(.document.designer.canvasWidthCm)cm routes=\(.document.designer.routes|length)"'
```

Estado local esperado tras el reset actual:

```text
1 default_installation Default Installation draft 170cm routes=4
```

5. Probar manualmente en `/partituras/designer/1`:
   - controller arriba a la izquierda sin encimar Fondo;
   - puerto rojo + terminal verde de cable suelda solo si comparten snap point;
   - terminal verde + rojo entre rutas suelda solo si comparten snap point;
   - arrastrar controller mueve cables conectados;
   - borrar una ruta limpia cian flotante.
