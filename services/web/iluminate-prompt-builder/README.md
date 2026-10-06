# Iluminate Prompt Builder

Herramienta interna, estática y sin dependencias para generar contratos de
cambio destinados a nuevas sesiones de IA.

## Qué protege

- Todo dominio inicia protegido.
- Solo los dominios marcados como `Permitido` entran en el alcance.
- Las superficies sensibles generan guardrails explícitos.
- El prompt incluye contexto, rutas probables, validaciones, revisión del diff y
  protocolo obligatorio para ampliar alcance.
- El formulario se conserva únicamente en `localStorage` del navegador. No
  envía datos ni requiere credenciales.

El catálogo vive en `catalog.mjs` y fue derivado de los servicios, rutas,
contratos y pruebas actuales del repositorio. Debe actualizarse cuando aparezca
un dominio durable o cambie su ownership.

## Ejecutar

Con Node 22:

```bash
cd services/web/iluminate-prompt-builder
npm start
```

Abrir `http://localhost:8440`.

También puede construirse como contenedor desde la raíz:

```bash
docker build -f services/web/iluminate-prompt-builder/Dockerfile -t iluminate-prompt-builder .
docker run --rm -p 8440:3000 iluminate-prompt-builder
```

No está agregado al `compose.yml` ni expuesto públicamente. Esa publicación
requiere una decisión explícita de infraestructura y acceso interno.

## Validar

```bash
npm test
```

Si Node no está instalado en el host:

```bash
docker run --rm -v "$PWD/services/web/iluminate-prompt-builder:/work" -w /work node:22-alpine npm test
```
