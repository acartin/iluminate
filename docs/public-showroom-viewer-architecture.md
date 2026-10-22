# Arquitectura del showroom público y Viewer de Iluminate

**Estado:** contrato arquitectónico objetivo; implementación futura por fases
**Autoridad:** fuente de verdad para la relación entre proyectos privados,
shares, Viewer, catálogo público y showroom
**Ámbito:** `services/web/iluminate`, `services/web/iluminate-public`,
`services/render-worker`, contratos de publicación y almacenamiento de medios
**No autoriza por sí mismo:** cambios de schema, migraciones, APIs, permisos,
Docker, despliegue, player, renderer, efectos o persistencia

## 1. Propósito

Este documento conserva la arquitectura acordada para que una sesión futura de
IA pueda continuar el Viewer y el showroom sin rediseñar sus límites.

La decisión central es:

> El Viewer canónico permanece dentro de la aplicación Iluminate. El sitio
> público es una aplicación editorial independiente que presenta póster, video,
> contenido SEO y, solo bajo demanda, abre o incrusta el Viewer de Iluminate.

No se copiarán ni moverán componentes React de Animate hacia
`services/web/iluminate-public`. Tampoco se implementará un segundo evaluador de
efectos, reloj, renderer WebGL2 o modelo óptico en el sitio público.

La independencia del sitio público es operativa y de seguridad, no una licencia
para duplicar la semántica de reproducción.

## 2. Contexto y estado actual

La implementación vigente ya contiene piezas que deben conservarse:

- `lighting-core` define `partitura.v2`, evaluación determinista de efectos,
  `visual-scene.v1` y `player-bundle.v1`.
- Animate usa un Worker dedicado y un renderer WebGL2 persistente bajo
  `services/web/iluminate/components/lighting/player`.
- La aplicación autenticada construye bundles inmutables y crea shares
  tenant-scoped.
- El render worker consume el mismo bundle y el mismo render harness para
  producir MP4 H.264 y póster WebP.
- Los medios privados y públicos viven en buckets separados.
- `/review/[slug]` en la aplicación autenticada muestra actualmente una
  revisión video-first mediante URLs firmadas.
- `/share/[slug]` en la web pública muestra actualmente una publicación
  video-first mediante un manifiesto público.
- `/projects` y `/projects/[slug]` consumen por ahora contenido tipado local en
  `services/web/iluminate-public/content/site.ts`.
- El `ProjectPlayer` actual del sitio público es una presentación conceptual;
  no es el player canónico y no debe evolucionar hasta convertirse en uno.

La existencia de estas piezas no significa que toda la infraestructura esté
configurada o desplegada en producción. Antes de implementar cada fase se debe
verificar el estado real de migraciones, buckets, worker, dominios y variables
sin mostrar secretos.

## 3. Objetivos

La arquitectura debe permitir:

1. Compartir una propuesta con un cliente mediante un enlace opaco, revocable y
   no indexado.
2. Permitir que el cliente comparta esa revisión con sus propios destinatarios
   según la política seleccionada.
3. Publicar, mediante una acción diferente, un proyecto autorizado dentro del
   showroom de Iluminate.
4. Presentar cards y páginas públicas rápidas usando póster y video.
5. Ofrecer interacción real mediante el Viewer canónico sin cargar Animate ni
   el editor completo.
6. Crear y retirar publicaciones desde una interfaz administrativa sin editar
   HTML, TSX ni desplegar el sitio público por cada proyecto.
7. Mantener contenido editorial rastreable y renderizado por servidor para SEO.
8. Conservar aislamiento multitenant, derechos de publicación y trazabilidad.
9. Mantener paridad visual entre Animate, Viewer y render offline.

## 4. No objetivos

Esta arquitectura no debe:

- mover Animate al sitio público;
- hacer que `iluminate-public` importe componentes internos del dashboard;
- implementar un segundo runtime, Worker o renderer;
- cargar `document_json` o estado editable en el Viewer;
- permitir Save, Compile, Generate, Publish o Deploy desde el Viewer;
- exponer proyectos mediante identificadores secuenciales;
- convertir un share de revisión en publicación pública automáticamente;
- conectar el sitio público directamente a PostgreSQL;
- entregar credenciales de R2, sesión, dispositivos o servicios internos al
  contenedor público;
- utilizar YouTube como base de datos, almacenamiento canónico o dependencia
  necesaria para reproducir un proyecto;
- incluir comentarios, aprobación contractual o anotaciones colaborativas en
  la primera versión del Viewer;
- prometer que revocar una publicación recupera archivos ya descargados o
  almacenados por terceros.

## 5. Decisión de ownership

### 5.1 Aplicación Iluminate — `app.iluminate.space`

`services/web/iluminate` es propietario de:

- creación, consulta y revocación de shares;
- verificación de tenant, usuario y permisos;
- generación de `player-bundle.v1`;
- acceso al bundle según política;
- Viewer canónico de solo lectura;
- Worker de evaluación, reloj y renderer WebGL2;
- resolución de tokens de Viewer;
- publicación y retiro administrativo del showroom;
- escritura de registros persistentes y auditoría;
- generación del read model público del catálogo.

El Viewer es una superficie pública limitada dentro de la aplicación, no una
sesión autenticada ni una versión reducida del dashboard.

### 5.2 Sitio público — `iluminate.space`

`services/web/iluminate-public` es propietario de:

- `/projects` y `/projects/[slug]`;
- composición editorial y SEO;
- cards, navegación, póster y preview de video;
- carga diferida del iframe del Viewer;
- fallback cuando el Viewer o WebGL2 no están disponibles;
- enlaces hacia templates, Learn y el handoff autenticado;
- consumo de un catálogo público de solo lectura.

No interpreta partituras, no construye visual scenes, no evalúa efectos y no
autoriza publicaciones.

### 5.3 Lighting core

`services/lighting-core` continúa siendo propietario de:

- contratos `partitura.v2`, `visual-scene.v1` y `player-bundle.v1`;
- versiones de runtime;
- validación;
- catálogo y parámetros de efectos;
- preparación del runtime y evaluación determinista de frames.

Ninguna necesidad editorial del showroom puede cambiar estos contratos de
forma implícita.

### 5.4 Render worker

`services/render-worker` continúa siendo propietario únicamente de:

- leasing de trabajos de render;
- uso del render harness protegido;
- producción de MP4 y WebP;
- escritura de medios en el bucket correcto;
- reintentos acotados y limpieza temporal.

No decide derechos, contenido editorial, slugs, indexación ni visibilidad.

## 6. Entidades distintas

Las siguientes entidades no deben colapsarse en una sola tabla o estado.

### 6.1 Proyecto

Workspace privado tenant-scoped. Agrupa diseño, assets, partituras,
controladores y contexto comercial. Nunca es público por existir.

### 6.2 Partitura

Documento editable y sus derivados. `document_json` sigue siendo la única
fuente editable; `compiledLayout` y `generated_json` siguen siendo derivados.

### 6.3 Player bundle

Artefacto inmutable identificado por hash. Contiene únicamente los contratos y
assets necesarios para reproducir una versión generada. No contiene permisos,
sesiones, controller credentials, historial editorial ni estado editable.

### 6.4 Render artifact

Resultado derivado de un bundle y un perfil: MP4, WebP y metadatos técnicos. Su
privacy forma parte de la deduplicación; un artefacto privado nunca se promueve
en sitio a público.

### 6.5 Scene share

Acceso opaco y revocable a un artefacto. Su propósito es revisión o
distribución por enlace. Las políticas siguen siendo `private`, `review`,
`unlisted` y `public`.

### 6.6 Showroom publication

Registro editorial independiente que decide si un proyecto aparece en
`/projects`. Debe referenciar un share o artefacto público apto, pero no es ese
share. Tiene slug estable, copy editorial, atribución, selección de medios,
estado y evidencia de autorización.

Regla obligatoria:

```text
crear share != publicar en showroom
revocar showroom != revocar share
revocar share != editar proyecto
```

## 7. Flujos normativos

### 7.1 Preparación del artefacto

```text
Editar proyecto
  -> Save persiste document_json
  -> Compile genera compiledLayout vigente
  -> Generate genera y valida partitura.v2
  -> Publish/Share construye player-bundle.v1 inmutable
  -> render worker produce poster.webp + scene.mp4
```

Share no puede confiar en un compile o `generated_json` obsoleto. Debe conservar
las invalidaciones y verificaciones definidas en `docs/partitura-lifecycle.md`.

### 7.2 Revisión de cliente

```text
Operador crea policy=review
  -> se crea slug opaco
  -> bundle y medios permanecen privados
  -> /viewer/review/{token} resuelve acceso
  -> servidor entrega URLs firmadas de corta duración
  -> Viewer muestra contenido sin indexación
  -> propietario puede revocar
```

La revisión no se puede incrustar desde el showroom. No debe depender de que el
visitante tenga sesión, pero el token es posesión sensible y nunca se registra
en analytics, títulos, referers propios ni mensajes de error.

### 7.3 Publicación en showroom

```text
Operador selecciona un share/artefacto elegible
  -> crea borrador editorial
  -> define slug, título, resumen, atribución y medios
  -> confirma derechos de publicación
  -> revisa preview
  -> publica
  -> se actualiza el catálogo público
  -> /projects/{slug} aparece sin nuevo deploy
```

No se permite seleccionar artefactos `private`, `review` o `unlisted` para el
showroom. Si el proyecto no tiene artefacto público, la acción debe crear uno
nuevo con privacy `public`; nunca debe copiar o renombrar el objeto privado.

### 7.4 Retiro

```text
Publicación publicada
  -> retirar del showroom
  -> eliminarla del índice público
  -> invalidar su manifiesto editorial mutable
  -> conservar auditoría
  -> decidir por separado si se revoca el Viewer público
```

Los bundles y medios públicos hash-addressed pueden permanecer en caches o
haber sido descargados. La UI debe advertir esta limitación antes de publicar.

## 8. URLs objetivo

Las rutas siguientes son objetivo; no deben documentarse como implementadas
hasta que existan y pasen validación.

| Superficie | URL objetivo | Indexación | Embebible |
| --- | --- | --- | --- |
| Revisión | `https://app.iluminate.space/viewer/review/{opaqueToken}` | `noindex, nofollow` | No |
| Viewer público | `https://app.iluminate.space/viewer/public/{publicToken}` | `noindex, nofollow` | Solo desde `https://iluminate.space` |
| Share público | `https://iluminate.space/share/{opaqueSlug}` | Según política | No requerido |
| Showroom | `https://iluminate.space/projects/{editorialSlug}` | Sí | Contiene el embed |
| Template | `https://iluminate.space/templates/{slug}` | Sí | Puede enlazar al Viewer |

La página indexable es `/projects/{editorialSlug}`. El Viewer público se marca
`noindex` para evitar duplicación, URLs con token en resultados y competencia
con el contenido editorial canónico.

## 9. Comportamiento del Viewer

### 9.1 Implementación

El Viewer se implementará dentro de `services/web/iluminate`, junto al player
existente. No se moverán componentes a la aplicación pública.

Debe agregarse una superficie bundle-first de solo lectura, conceptualmente
`PublishedViewerSurface`, que reciba el resultado validado de
`loadPlayerBundle`:

```text
partitura.v2 + visual-scene.v1 + manifest
  -> PlayerController
  -> player Worker
  -> Webgl2PlayerRenderer
  -> canvas persistente
```

No debe recibir `DesignerForm`, `document_json`, `compiledLayout`, selección de
Designer ni callbacks de edición. La construcción de `visual-scene.v1` sucede
antes de publicar, nunca dentro del Viewer.

Animate puede conservar su adaptador authoring-aware. El Viewer y el render
harness deben reutilizar clases y contratos existentes dentro de la misma
aplicación, sin crear un segundo reloj o renderer.

### 9.2 Controles de Viewer v1

Permitidos:

- reproducir y pausar;
- detener y volver al inicio;
- seleccionar una escena incluida en el bundle;
- scrub de tiempo;
- mostrar duración y estado;
- zoom/pan o encuadre predeterminado;
- `As built` y `LED map`, solo si ambos están soportados por el bundle;
- pantalla completa;
- recuperación ante pérdida de contexto WebGL2.

No permitidos en v1:

- editar clips, pistas, targets o efectos;
- cambiar parámetros de efectos;
- reemplazar paletas;
- persistir cambios;
- Save, Compile, Generate, Publish o Deploy;
- seleccionar controladores o enviar comandos;
- mostrar Layers, barras de Designer o timeline editable;
- descargar `document_json`;
- revelar nombres internos, IDs tenant-scoped o rutas de storage.

Los experimentos futuros con paleta, intensidad, velocidad o efecto deben ser
temporales, explícitamente no persistentes y autorizados como una ampliación del
contrato. No forman parte de Viewer v1.

### 9.3 Modos visuales

El mismo renderer sirve ambos contextos, pero la envoltura cambia:

- `review`: marca de revisión, política, estado y aviso de enlace revocable;
- `public`: controles mínimos, marca Iluminate y CTA editorial opcional;
- `embed`: igual semántica que `public`, sin navegación del dashboard y con UI
  compacta para el contenedor.

El parámetro `embed` nunca cambia permisos ni privacidad. Solo cambia layout.

## 10. Integración mediante iframe

### 10.1 Carga progresiva

`/projects/[slug]` no debe cargar el iframe al render inicial.

Secuencia:

1. Renderizar HTML editorial, póster WebP y controles accesibles.
2. Reproducir MP4 solo cuando las preferencias y el viewport lo permitan.
3. Mostrar `Explorar interacción`.
4. Al activar el botón, montar el iframe del Viewer.
5. Mantener video/póster como fallback si el Viewer falla.
6. Permitir abrir el Viewer en una pestaña o pantalla completa.

Nunca se crearán iframes en todas las cards del índice. Las cards usan medios
estáticos o video, no instancias del player.

### 10.2 Restricciones del frame

El Viewer público debe emitir una política equivalente a:

```text
Content-Security-Policy: frame-ancestors https://iluminate.space
X-Robots-Tag: noindex, nofollow
```

No debe existir un `X-Frame-Options` incompatible con `frame-ancestors` para
esa ruta concreta. Otras rutas del dashboard pueden continuar bloqueando frames.

El iframe público debe usar como base:

```html
<iframe
  title="Vista interactiva de {projectTitle}"
  loading="lazy"
  allow="fullscreen"
  referrerpolicy="strict-origin-when-cross-origin"
  sandbox="allow-scripts allow-same-origin"
/>
```

Los permisos finales del sandbox deben comprobarse con Worker, WebGL2 y
fullscreen. No se añadirán `allow-forms`, `allow-popups`, `allow-downloads` ni
`allow-top-navigation` sin una necesidad demostrada.

### 10.3 `postMessage`

La primera versión no necesita comandos de reproducción desde el padre. Si se
usa `postMessage`, solo se permite un protocolo versionado y mínimo:

```json
{
  "type": "iluminate.viewer.ready",
  "version": 1,
  "viewerId": "opaque-public-id"
}
```

Mensajes futuros posibles: `ready`, `error`, `playing`, `paused` y
`request-fullscreen`. Ambos lados deben:

- comparar `event.origin` con un origen exacto;
- verificar forma, versión y tipo;
- no usar `*` como `targetOrigin`;
- no transportar tokens, bundles, credenciales ni payloads de proyecto;
- ignorar mensajes desconocidos.

## 11. Experiencia del showroom

### 11.1 `/projects`

Cada card requiere:

- slug editorial estable;
- título;
- etiqueta de tipo de proyecto;
- atribución aprobada;
- póster WebP;
- alt text editorial;
- video corto opcional;
- estado publicado;
- orden o bandera `featured`.

Desktop puede reproducir video muted/loop al hover o cuando la card está
visible. Móvil debe priorizar póster y evitar descargar todos los videos.

### 11.2 `/projects/[slug]`

Orden recomendado:

1. Hero con póster o video.
2. Título, resumen y atribución.
3. Declaración conceptual y datos públicos seleccionados.
4. CTA `Explorar interacción`.
5. Viewer embebido bajo demanda.
6. Relación con template, si existe.
7. CTA hacia Designer mediante `/handoff`.
8. Proyecto siguiente.

La página debe seguir siendo útil cuando JavaScript, video o Viewer fallen.

### 11.3 Fallbacks

| Condición | Resultado |
| --- | --- |
| WebGL2 no disponible | MP4 con controles |
| `prefers-reduced-motion` | Póster y reproducción manual |
| Ahorro de datos o móvil | Póster primero; video/Viewer bajo demanda |
| Viewer timeout | Mensaje breve y MP4 |
| Bundle incompatible | MP4 y error no técnico |
| Share revocado | Viewer no disponible; página editorial se retira o actualiza |
| Video no disponible | Póster y Viewer si es válido |

## 12. Modelo editorial objetivo

El nombre final de tabla y DTO se decidirá al diseñar persistencia, pero el
registro conceptual `ShowroomPublication` debe incluir como mínimo:

```text
id
client_id
project_id
partitura_id
scene_share_id
render_artifact_id
editorial_slug
status: draft | published | withdrawn
title
summary
statement
project_type
year_label
location_label
attribution_mode: iluminate | named_client | anonymous_client
attribution_name nullable
poster_alt
template_slug nullable
featured
sort_order
rights_confirmed_at
rights_confirmed_by
rights_scope
published_at nullable
withdrawn_at nullable
created_at
updated_at
```

Guardrails del modelo:

- `client_id` siempre proviene de sesión confiable, nunca del formulario.
- `scene_share_id` debe pertenecer al mismo `client_id`.
- el share debe ser `public`, estar activo y apuntar a un artefacto listo;
- `editorial_slug` es globalmente único para el showroom;
- cambiar el slug publicado requiere redirect editorial explícito o rechazo;
- `rights_confirmed_at/by/scope` son obligatorios antes de `published`;
- `attribution_name` se publica solo cuando `attribution_mode=named_client`;
- retirar no elimina auditoría;
- cambiar proyecto o partitura no actualiza silenciosamente la publicación;
- una nueva versión visual crea un nuevo artefacto y requiere acción explícita
  para sustituir el artefacto publicado.

## 13. Read model público

El sitio público no consulta PostgreSQL. La aplicación autenticada publica un
read model sanitizado en el origen público de medios/CDN.

Contratos objetivo:

```text
/catalog/showroom-index.v1.json
/catalog/projects/{editorialSlug}.v1.json
```

El índice contiene solo campos necesarios para cards. El manifiesto individual
contiene el contenido de la página y URLs públicas aprobadas.

Ejemplo conceptual del manifiesto individual:

```json
{
  "version": "showroom-project.v1",
  "slug": "signal-no-01",
  "status": "published",
  "title": "Signal No. 01",
  "summary": "Estudio de luz direccionable.",
  "statement": "Texto editorial aprobado.",
  "projectType": "Rótulo volumétrico",
  "attribution": {
    "mode": "iluminate",
    "displayName": "Iluminate Original"
  },
  "media": {
    "posterUrl": "https://media.iluminate.space/.../poster.webp",
    "posterAlt": "Rótulo Signal iluminado en rojo",
    "videoUrl": "https://media.iluminate.space/.../scene.mp4",
    "width": 1920,
    "height": 1080,
    "durationMs": 8000
  },
  "viewer": {
    "url": "https://app.iluminate.space/viewer/public/opaque-token",
    "embeddable": true
  },
  "templateSlug": "secuencia-signal",
  "publishedAt": "2026-10-17T00:00:00.000Z",
  "updatedAt": "2026-10-17T00:00:00.000Z"
}
```

El manifiesto nunca incluye:

- `client_id`, IDs internos o emails;
- nombres de bucket u object keys privados;
- URL de revisión;
- `document_json`;
- controller IDs o deployment state;
- audit metadata;
- credenciales o URLs firmadas privadas;
- nombre de cliente cuando la atribución sea anónima.

El índice y manifiestos editoriales son mutables y deben usar TTL corto con
revalidación. Bundles y medios públicos hash-addressed son inmutables y pueden
usar cache largo.

## 14. Medios

### 14.1 Póster

Obligatorio para toda publicación. Se usa en:

- card;
- carga inicial;
- fallback;
- Open Graph;
- Twitter/X card;
- reduced motion;
- conexiones lentas;
- estado previo al Viewer.

Debe ser un WebP generado por el render worker o un reemplazo editorial
explícitamente aprobado. Dimensiones y checksum se conservan como metadatos.

### 14.2 Video

Recomendado y generado por defecto. MP4 H.264 sigue siendo la preview portátil.
No debe bloquear el HTML ni reproducirse con sonido automáticamente.

### 14.3 Bundle interactivo

Opcional para la página editorial, obligatorio para habilitar el Viewer. Se
carga solo después de una acción o decisión explícita de performance.

### 14.4 YouTube

Es destino de distribución y educación. Puede enlazarse o incrustarse en Learn,
pero no sustituye el póster, MP4, bundle, catálogo ni evidencia de derechos.
Subir trabajo de cliente requiere autorización separada para esa plataforma.

## 15. Seguridad y privacidad

### 15.1 Tokens

- Deben ser criptográficamente aleatorios y no enumerables.
- Nunca usar IDs de proyecto, partitura, share o tenant como token público.
- Review y public Viewer usan tokens diferentes.
- Los tokens no aparecen en logs de aplicación a nivel informativo, analytics,
  mensajes de error, títulos ni datos estructurados.
- Revocación debe bloquear nuevas resoluciones inmediatamente o dentro del TTL
  explícitamente documentado.

### 15.2 Sesión y cookies

El Viewer público y de revisión no depende de una sesión autenticada. La
posesión del token y su política resuelta por servidor autorizan solo lectura.
No debe confiar en `client_id`, role o flags enviados por el browser.

### 15.3 Storage

- Private/review/unlisted permanecen en bucket privado.
- Sus medios se sirven con URLs firmadas de corta duración y `no-store`.
- Public usa bucket/origen público solo después de confirmar derechos.
- El sitio público recibe URLs HTTP públicas, nunca credenciales de R2.
- CORS del origen público permite únicamente los orígenes y métodos requeridos.

### 15.4 Embedding

- Solo el Viewer `public` puede aceptar `frame-ancestors iluminate.space`.
- Review y dashboard continúan sin embedding público.
- El token público debe seguir siendo revocable aunque el iframe sea público.
- No se habilita comunicación cross-origin genérica.

### 15.5 Rights

Antes de publicar se debe mostrar una confirmación inequívoca de que el actor
tiene autorización para distribuir públicamente diseño, nombre, marca, video y
atribución seleccionada. La transición se registra en auditoría append-only.

## 16. SEO

- `/projects/{slug}` es la URL canónica indexable.
- Viewer, review y URLs con token son `noindex, nofollow`.
- La página pública tiene título, description, canonical, Open Graph, póster y
  contenido HTML sin depender del iframe.
- El iframe no es la fuente del copy que debe entender Google.
- El sitemap incluye solo publicaciones `published` y canónicas.
- Retirar una publicación la elimina del sitemap y debe resolver según política
  editorial: `410`, `404` o redirect aprobado; no se elige silenciosamente.
- Shares opacos no se añaden al sitemap.
- Datos estructurados describen la página editorial, no afirman cliente,
  instalación, ubicación o resultados no autorizados.

## 17. Performance y accesibilidad

- No cargar iframes en el índice de proyectos.
- No descargar todos los MP4 en móvil.
- Reservar `aspect-ratio` para evitar layout shift.
- Suspender video y Viewer fuera del viewport.
- Respetar `prefers-reduced-motion`.
- Ofrecer controles con nombre accesible y uso por teclado.
- Mantener contraste y foco visibles.
- El canvas requiere nombre accesible y fallback textual/video.
- Errores técnicos no deben mostrarse al visitante; se registran con un
  correlation ID sin datos sensibles.
- El Viewer debe recuperarse de pérdida de contexto WebGL2.
- Fullscreen debe funcionar tanto directo como embebido cuando el navegador lo
  permita.

## 18. Cache e invalidación

Política objetivo:

| Recurso | Mutabilidad | Cache |
| --- | --- | --- |
| Bundle público por hash | Inmutable | Largo, `immutable` |
| MP4/WebP público por hash | Inmutable | Largo, `immutable` |
| Manifiesto de share | Mutable/revocable | Corto, revalidado |
| Índice del showroom | Mutable | Corto, revalidado |
| Manifiesto editorial | Mutable | Corto, revalidado |
| Medios privados firmados | Efímero | `private, no-store` |

Retirar una publicación debe actualizar primero la fuente persistente y luego
el read model. Si falla la escritura pública, la operación queda visible como
fallida o pendiente; nunca se informa éxito falso.

## 19. Fallos y degradación

El sistema debe fallar de manera contenida:

- Render pendiente: mostrar póster provisional aprobado o estado no publicado.
- Render fallido: no publicar; permitir reintento desde Iluminate.
- Catálogo CDN no disponible: conservar última versión revalidada cuando sea
  seguro; no inventar proyectos.
- Viewer no disponible: mantener página, póster y video.
- Bundle incompatible: rechazar interacción y conservar video.
- Token revocado: responder 404/410 sin revelar que el recurso existió.
- Share privado seleccionado por error: API rechaza antes de escribir catálogo.
- Rights incompletos: estado no puede pasar a `published`.
- Proyecto eliminado internamente: no borrar automáticamente evidencia o
  publicación; exigir flujo explícito y auditado.

## 20. Observabilidad mínima

Sin registrar tokens ni secretos, medir:

- publicaciones por estado;
- jobs queued/running/failed;
- edad del job más antiguo;
- errores de generación del read model;
- carga correcta/fallida del Viewer;
- fallback a video;
- incompatibilidad de runtime/bundle;
- tiempo hasta primer frame;
- activación de `Explorar interacción`;
- retiros y revocaciones auditadas.

Analytics públicos deben usar el slug editorial o un ID público no sensible,
nunca IDs tenant-scoped ni tokens.

## 21. Secuencia de implementación

### Fase 0 — Verificación operativa

- Confirmar migración de rendering/shares.
- Confirmar worker, buckets y origen público.
- Crear un share `review` real y revocarlo.
- Crear un share `public` de un Iluminate Original y revocarlo.
- Verificar que ningún secreto llegue a ambos browsers.

### Fase 1 — Viewer bundle-first dentro de Iluminate

- Crear la ruta y superficie de Viewer sin mover componentes a la web pública.
- Cargar y verificar `player-bundle.v1`.
- Reutilizar `PlayerController`, Worker y `Webgl2PlayerRenderer` existentes.
- Implementar controles v1 y fallbacks.
- Probar paridad con Animate y render harness usando el mismo bundle.

### Fase 2 — Viewer review/public

- Resolver tokens por servidor.
- Separar policies, headers, noindex y frame policy.
- Usar URLs firmadas para review y públicas para public.
- Probar expiración, revocación, cross-tenant access y ausencia de sesión.

### Fase 3 — Embed en un Iluminate Original

- Mantener contenido local del proyecto.
- Añadir póster/video reales.
- Montar iframe solo bajo demanda.
- Validar desktop, móvil, 320 px, reduced motion, WebGL2 ausente y fullscreen.

### Fase 4 — Persistencia editorial y read model

- Diseñar migración y ownership de `ShowroomPublication`.
- Crear API administrativa tenant-scoped.
- Escribir índice y manifiestos sanitizados.
- Cambiar `/projects` y `/projects/[slug]` de contenido local a content provider.
- Mantener fallback controlado durante la transición.

### Fase 5 — Administrador

- Listar shares públicos elegibles.
- Crear/editar borrador editorial.
- Seleccionar atribución y medios.
- Confirmar derechos.
- Preview exacto.
- Publicar, reemplazar versión y retirar.

### Fase 6 — Clientes

- Probar el flujo con proyectos autorizados.
- Validar texto de consentimiento y atribución.
- Añadir controles o automatización solo según evidencia de uso.

## 22. Pruebas obligatorias futuras

### Player y paridad

- Mismo bundle produce escenas, duración y frames equivalentes en Viewer,
  Animate y render harness.
- Un `requiredRuntimeVersion` incompatible se rechaza.
- Checksums, tamaños y paths inseguros se rechazan.
- Solo un frame permanece en vuelo y el buffer se reutiliza.
- Hidden/offscreen suspende trabajo.

### Seguridad

- Token de otro tenant no filtra existencia ni metadata.
- Review no puede embeberse desde `iluminate.space`.
- Public embed rechaza origins no autorizados.
- No hay cookies o sesión requeridas para Viewer público.
- Revocación impide nuevas cargas.
- Ningún manifiesto público contiene IDs internos o URLs privadas.

### Publicación

- No se publica sin rights confirmation.
- No se publica con artefacto no listo o privacy incorrecta.
- Retiro elimina el proyecto del índice público.
- Reemplazar versión no muta el bundle anterior.
- Share y showroom pueden revocarse de forma independiente.

### Web pública

- HTML útil sin JavaScript.
- Canonical, sitemap, metadata y póster correctos.
- Iframe lazy y ausente en cards.
- Video/póster funcionan si Viewer falla.
- Responsive sin overflow a 320 px.
- Handoff a la aplicación permanece correcto.

## 23. Guardrails explícitos

Una implementación futura debe detenerse y pedir ampliación de alcance antes de
tocar cualquiera de estas superficies protegidas si la solicitud solo autoriza
el sitio público:

- `services/web/iluminate/components/lighting/player/**`;
- rutas Viewer bajo `services/web/iluminate/app/**`;
- APIs de shares/publicación;
- `services/lighting-core/**`;
- PostgreSQL, migraciones o modelos tenant-scoped;
- R2, buckets, CORS, CDN o URLs firmadas;
- `services/render-worker/**`;
- auth, roles, permisos o cookies;
- Docker, Compose, dominios o variables de entorno.

La ampliación mínima debe enumerar archivos concretos después de inspeccionar
el código actual y justificar:

1. por qué no basta una modificación pública;
2. qué contrato se abre;
3. cómo se conserva paridad y multitenancy;
4. qué pruebas de regresión se añadirán;
5. cómo se hará rollback.

Guardrails permanentes:

- No mover componentes del player al sitio público.
- No duplicar shader, Worker, reloj, evaluator o semántica óptica.
- No modificar `partitura.v2` para guardar estado editorial.
- No modificar reglas de Save, Compile, Generate o invalidación.
- No hacer público un objeto privado por cambio de ACL o rename.
- No confiar en tenant, rights o attribution enviados libremente por browser.
- No publicar trabajo de cliente sin confirmación explícita y auditada.
- No indexar URLs con token.
- No permitir que un iframe controle el dashboard.
- No degradar la página editorial si el Viewer no está disponible.
- No añadir dependencias, migraciones o infraestructura sin autorización
  expresa y validación proporcional.

## 24. Criterio de aceptación arquitectónico

La arquitectura se considera respetada cuando:

```text
Iluminate conserva un solo player canónico.
El sitio público conserva su despliegue y seguridad independientes.
El showroom no requiere editar HTML por proyecto.
Share y showroom son estados separados.
El contenido indexable no depende del iframe.
La interacción usa un bundle inmutable y de solo lectura.
Los medios privados nunca entran al bucket público.
Publicar requiere derechos explícitos y auditados.
Video y póster mantienen la experiencia si el Viewer falla.
```

Hasta que existan proyectos mostrables, esta especificación guía la dirección
pero no obliga a construir anticipadamente el CMS ni el Viewer interactivo.
