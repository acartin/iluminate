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
- `components/lighting/designer`: editor grafico de partituras; debe mantenerse modular por tipos, canvas, renderer, geometria/wiring, compiler y UI.
- `components/editor`: canvas, herramientas de rutas fisicas, zonas y grupos, cuando se creen.
- `components/timeline`: escenas, pistas y clips, cuando se creen.
- `lib`: clientes API, helpers, tipos de UI y mocks temporales explicitamente marcados.

Reglas:

- El frontend no debe conectarse directo a Postgres.
- Todo dato real debe venir de APIs/contratos del servicio propietario.
- Los mocks deben estar marcados como temporales.
- El web no debe ser la fuente de verdad de la partitura; debe consumir `lighting-core`.

Idioma de UI:

- Usar ingles por defecto para copy visible del producto, salvo que se pida una variante localizada.
- Mantener terminos de dominio estables: string, zone, group, pixelMap, partitura, scene, track, clip, effect, controller, deployment. Los segmentos/rangos logicos no son una herramienta normal de autoria.
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
- Crear zonas geometricas que seleccionen pixeles por posicion.
- Crear grupos nombrados que combinen zonas, sin alterar cableado ni duplicar pixeles.

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

- Paper.js para el canvas de autoria vectorial avanzada. El Designer debe renderizar sobre HTML canvas + Paper.js; no reconstruir un motor SVG paralelo para strings, zonas o controlador.
- PixiJS si el simulador lo requiere.
- Librerias funcionales pequenas.
- Iconos de la libreria ya presente.

No permitido:

- Templates UI externos.
- Kits completos que reemplacen el sistema actual.
- Dependencias que impongan una estetica ajena.

## 12. Checklist antes de implementar UI

1. Leer `.agent/RULES.md`, `.agent/EXECUTION_MAP.md`, `.agent/FILESYSTEM_GUARDRAILS.md` y este documento.
2. Revisar componentes existentes.
3. Confirmar si la pantalla es editor, simulator, CRUD, dashboard, detalle o configuracion.
4. Confirmar servicio propietario del dato.
5. Confirmar contrato API o mock temporal.
6. Implementar cambios pequenos.
7. Validar minimamente.
8. Reportar que se reutilizo, que se creo y por que.

## 13. Checklist de rechazo

Detenerse antes de implementar si el cambio propone:

- Reescribir el portal completo.
- Reemplazar AppShell/Sidebar/Topbar o UI primitives sin justificacion.
- Conectar frontend directo a Postgres.
- Hacer del web la fuente de verdad de la partitura.
- Usar un documento privado de Paper.js/Konva/timeline como formato canonico.
- Hardcodear colores fuera del sistema de tokens.
- Mostrar JSON crudo de errores.
- Usar GET/Link para logout o mutaciones.
- Habilitar edicion/delete real sin contrato backend.
- Meter estetica marketing en pantallas operativas.
