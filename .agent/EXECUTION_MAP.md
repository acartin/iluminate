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
