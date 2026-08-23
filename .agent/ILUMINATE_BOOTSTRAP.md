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
