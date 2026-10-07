export const MODES = [
  { id: "review", label: "Solo revisión", directive: "Revisa y comenta con evidencia. No modifiques archivos." },
  { id: "diagnose", label: "Solo diagnóstico", directive: "Determina la causa con evidencia reproducible. No implementes la solución." },
  { id: "diagnose_implement", label: "Diagnosticar e implementar", directive: "Determina la causa, implementa la corrección mínima y añade una prueba de regresión." },
  { id: "implement", label: "Implementar", directive: "Implementa el comportamiento solicitado con el cambio mínimo coherente." },
  { id: "refactor", label: "Refactor controlado", directive: "Refactoriza únicamente el alcance permitido, conservando comportamiento observable y contratos." },
  { id: "plan", label: "Planificar", directive: "Inspecciona el estado actual y entrega un plan verificable. No modifiques archivos." },
  { id: "operate", label: "Operar o desplegar", directive: "Ejecuta únicamente la operación autorizada, verificando destino, secretos, resultado y posibilidad de reversión." }
];

export const PROTECTED_SURFACES = [
  { id: "ui_layout", label: "Posición y jerarquía de UI", guardrail: "No muevas, añadas, elimines ni renombres botones, barras, paneles, Layers, toolbox o navegación." },
  { id: "user_behavior", label: "Comportamiento visible", guardrail: "No cambies interacciones, atajos, estados, textos o flujos visibles que no estén expresamente incluidos." },
  { id: "designer_geometry", label: "Geometría persistida", guardrail: "No cambies geometría canónica, normalización, proyecciones, operaciones derivadas ni compatibilidad de documentos." },
  { id: "electrical_model", label: "Modelo eléctrico", guardrail: "No cambies controller, outputs, cables, LED strings, soldaduras, orden serial ni reglas de conectividad." },
  { id: "partitura_schema", label: "Schema y persistencia de partitura", guardrail: "No cambies el schema, document_json, generated_json, defaults, migraciones ni formato persistido de partitura." },
  { id: "compile_lifecycle", label: "Save / Compile / Generate", guardrail: "No cambies las reglas de Save, Compile, Preview, Generate, Publish ni invalidación de artefactos." },
  { id: "effect_contract", label: "Contratos de efectos y clips", guardrail: "No cambies identificadores, parámetros, targets, coordinate spaces, blend modes ni semántica de clips/efectos." },
  { id: "optical_model", label: "Óptica y Face Graphic", guardrail: "No cambies Front, Halo, Wall Wash, materiales, difusión, Face Graphic ni composición óptica." },
  { id: "api_contract", label: "APIs y contratos entre servicios", guardrail: "No cambies endpoints, DTOs, respuestas, ownership de APIs ni contratos entre servicios." },
  { id: "database", label: "Base de datos y tenancy", guardrail: "No cambies PostgreSQL, migraciones, client_id, R2 ni reglas de propiedad multitenant." },
  { id: "auth_security", label: "Auth, permisos y secretos", guardrail: "No cambies login, sesiones, roles, permisos, cookies, credenciales ni límites de seguridad." },
  { id: "dependencies", label: "Dependencias y lockfiles", guardrail: "No añadas, elimines ni actualices dependencias, package-lock, toolchains o versiones de runtime." },
  { id: "infrastructure", label: "Compose y producción", guardrail: "No cambies Docker, Compose, puertos, dominios, variables de entorno, túneles ni despliegue." },
  { id: "public_experience", label: "Sitio público", guardrail: "No cambies contenido, SEO, rutas, hero, templates, learning ni comportamiento del sitio público." },
  { id: "firmware_device", label: "Firmware y dispositivo", guardrail: "No cambies el contrato del firmware externo, protocolo de dispositivo, outputs soportados ni payload descargable." },
  { id: "documentation", label: "Contratos documentales", guardrail: "No reescribas documentación o planes fuera de los contratos que cambien realmente por esta tarea." }
];

export const GROUPS = [
  { id: "experience", label: "Experiencia y portal" },
  { id: "designer", label: "Designer y fabricación" },
  { id: "animation", label: "Animate, player y efectos" },
  { id: "domain", label: "Partitura y dominio LED" },
  { id: "platform", label: "Datos, dispositivos y plataforma" },
  { id: "operations", label: "Sitio público, infraestructura y documentación" }
];

export const DOMAINS = [
  {
    id: "portal_shell", group: "experience", label: "Shell, navegación y tema",
    summary: "AppShell, Sidebar, Topbar, navegación, foco, tema y primitives compartidos.",
    paths: ["services/web/iluminate/components/portal", "services/web/iluminate/components/ui", "services/web/iluminate/app/globals.css", "services/web/iluminate/lib/modules.ts"],
    context: [".agent/ILUMINATE_UI_STANDARDS.md"],
    validations: ["Build de services/web/iluminate", "Smoke de rutas y navegación afectadas"],
    keywords: ["botones", "sidebar", "topbar", "tema", "layout", "navegación"]
  },
  {
    id: "auth_ui", group: "experience", label: "Login y recuperación",
    summary: "Login, logout, cookies de sesión, recuperación y simulación de rol en la UI.",
    paths: ["services/web/iluminate/app/login", "services/web/iluminate/app/forgot-password", "services/web/iluminate/app/reset-password", "services/web/iluminate/app/api/auth", "services/web/iluminate/lib/api.ts"],
    context: [".agent/FILESYSTEM_GUARDRAILS.md", ".agent/ILUMINATE_UI_STANDARDS.md", "services/auth/README.md"],
    validations: ["Build web", "Smoke de login/logout y códigos 401/403"],
    keywords: ["login", "logout", "contraseña", "sesión", "cookie", "rol"]
  },
  {
    id: "settings_crud", group: "experience", label: "Settings y CRUD administrativo",
    summary: "Usuarios, clientes, tenants, roles, agentes, contactos, números y asignaciones.",
    paths: ["services/web/iluminate/components/crud", "services/web/iluminate/app/api/settings", "services/web/iluminate/app/[group]"],
    context: [".agent/ILUMINATE_UI_STANDARDS.md", ".agent/DATABASE_MODEL.md"],
    validations: ["Build web", "Smoke del CRUD y permisos afectados"],
    keywords: ["usuarios", "clientes", "tenants", "roles", "agentes", "crud", "settings"]
  },
  {
    id: "projects_assets", group: "experience", label: "Proyectos, workspaces y assets",
    summary: "Listado de proyectos, workspace, partitura activa, galería y carga de assets en R2.",
    paths: ["services/web/iluminate/components/lighting/projects-workbench.tsx", "services/web/iluminate/components/lighting/project-asset-gallery.tsx", "services/web/iluminate/app/projects", "services/web/iluminate/lib/server/projects.ts", "services/web/iluminate/lib/server/r2-assets.ts"],
    context: [".agent/ILUMINATE_UI_STANDARDS.md", ".agent/DATABASE_MODEL.md"],
    validations: ["Build web", "Smoke de proyectos/assets", "Verificar aislamiento por client_id"],
    keywords: ["proyectos", "workspace", "assets", "r2", "subir", "galería"]
  },
  {
    id: "designer_layout", group: "designer", label: "Studio, barras y Layers",
    summary: "Estructura global/contextual, rail, Layers, selección sincronizada y comandos del Studio.",
    paths: ["services/web/iluminate/components/lighting/partitura-workspace.tsx", "services/web/iluminate/components/lighting/designer/designer-ui.tsx", "services/web/iluminate/components/lighting/designer/types.ts"],
    context: [".agent/DESIGNER_UX_CONTRACT.md", ".agent/DESIGNER_HANDOFF.md", ".agent/ILUMINATE_UI_STANDARDS.md"],
    validations: ["Pruebas del Designer", "Build web", "Smoke visual de barras, Layers y selección"],
    keywords: ["layers", "toolbar", "barra", "toolbox", "selección", "botón", "studio"]
  },
  {
    id: "designer_canvas", group: "designer", label: "Canvas, viewport y herramientas",
    summary: "Paper canvas, hit testing, zoom/pan, medición, dibujo y política de herramientas por layer.",
    paths: ["services/web/iluminate/components/lighting/designer/designer-paper-canvas.tsx", "services/web/iluminate/components/lighting/designer/designer-paper-renderer.ts", "services/web/iluminate/components/lighting/designer/canvas/designer-tool-policy.ts", "services/web/iluminate/components/lighting/designer/designer-geometry.ts"],
    context: [".agent/DESIGNER_UX_CONTRACT.md", ".agent/DESIGNER_HANDOFF.md"],
    validations: ["Pruebas del Designer", "Build web", "Smoke de puntero, zoom, pan y herramienta afectada"],
    keywords: ["canvas", "paper", "zoom", "pan", "hit", "herramienta", "medir"]
  },
  {
    id: "canonical_geometry", group: "designer", label: "Geometría canónica y booleans",
    summary: "Shapes, contours, Beziers, holes, hit/containment, Union/Subtract/Intersect/Exclude.",
    paths: ["services/web/iluminate/components/lighting/designer/geometry", "services/web/iluminate/lib/lighting/partitura-model.ts", "services/web/iluminate/components/lighting/designer/designer-geometry.test.ts"],
    context: [".agent/DESIGNER_HANDOFF.md"],
    validations: ["Pruebas deterministas de geometría", "Build web", "Regresión save/reload"],
    keywords: ["geometría", "bezier", "compound", "boolean", "hole", "contorno"]
  },
  {
    id: "projections_derived", group: "designer", label: "Proyecciones, offset y fillet",
    summary: "Project Geometry, referencias enlazadas, ciclos, Break Link, offsets y fillets vivos.",
    paths: ["services/web/iluminate/lib/lighting/partitura-model.ts", "services/web/iluminate/lib/lighting/designer-derived-geometry.ts", "services/web/iluminate/components/lighting/designer/geometry"],
    context: [".agent/DESIGNER_HANDOFF.md", "docs/upgrade.doc"],
    validations: ["Pruebas de projection/derived geometry", "Regresión de ciclos y referencias rotas", "Build web"],
    keywords: ["project geometry", "projection", "offset", "fillet", "break link", "derivada"]
  },
  {
    id: "designer_text", group: "designer", label: "Texto y fuentes controladas",
    summary: "Texto editable, catálogo/hash de fuentes, shaping y conversión determinista a paths.",
    paths: ["services/web/iluminate/lib/lighting/designer-font-catalog.ts", "services/web/iluminate/lib/lighting/designer-text-geometry.ts", "services/web/iluminate/app/api/lighting/fonts"],
    context: [".agent/DESIGNER_HANDOFF.md"],
    validations: ["Pruebas de texto/outlines", "Verificar hash y fuente controlada", "Build web"],
    keywords: ["texto", "font", "fuente", "outline", "convert to paths"]
  },
  {
    id: "electrical_routes", group: "designer", label: "Cableado, strings y controller",
    summary: "Data cables, LED strings, terminales, soldadura, joints, cortes, controller y outputs.",
    paths: ["services/web/iluminate/components/lighting/designer/electrical", "services/web/iluminate/components/lighting/designer/designer-compiler.ts", "services/web/iluminate/components/lighting/designer/designer-paper-canvas.tsx"],
    context: [".agent/PIXELMAP_COMPOSER_DIRECTION.md", ".agent/DESIGNER_HANDOFF.md", "docs/partitura-lifecycle.md"],
    validations: ["Pruebas eléctricas del Designer", "Compile de fixture conectado", "Build web"],
    keywords: ["cable", "string", "controller", "soldar", "joint", "terminal", "output"]
  },
  {
    id: "zones_sources", group: "designer", label: "Zones, channels y Light Sources",
    summary: "Zonas, channels, groups visuales, targets físicos y configuración Front/Halo/Wall Wash.",
    paths: ["services/web/iluminate/lib/lighting/partitura-model.ts", "services/web/iluminate/components/lighting/partitura-workspace.tsx", "services/web/iluminate/components/lighting/designer/designer-ui.tsx"],
    context: [".agent/EFFECT_TARGETING_MODEL.md", ".agent/DESIGNER_HANDOFF.md", ".agent/DESIGNER_UX_CONTRACT.md"],
    validations: ["Pruebas de targets y selección", "Compile/preview del target afectado", "Build web"],
    keywords: ["zone", "channel", "group", "light source", "front", "halo", "wall wash"]
  },
  {
    id: "face_graphic", group: "designer", label: "Face Graphic y filtro óptico",
    summary: "Máscaras opaque/clear/translucent, filterColor y efecto exclusivo sobre luz frontal.",
    paths: ["services/web/iluminate/components/lighting/player/gpu/webgl2-player-renderer.ts", "services/web/iluminate/lib/lighting/visual-scene-builder.ts", "services/web/iluminate/lib/lighting/partitura-model.ts", "services/web/iluminate/components/lighting/designer/designer-paper-renderer.ts"],
    context: [".agent/DESIGNER_HANDOFF.md", ".agent/DESIGNER_UX_CONTRACT.md"],
    validations: ["Pruebas ópticas de Face Graphic", "Smoke As built y LED map", "Build web"],
    keywords: ["face graphic", "máscara", "translucent", "opaque", "filter", "óptica"]
  },
  {
    id: "fabrication_export", group: "designer", label: "Exportación SVG/DXF",
    summary: "Validación y serialización 1:1 de fabricación, layers/materiales, curves y metadata.",
    paths: ["services/web/iluminate/components/lighting/designer/fabrication/designer-fabrication-export.ts", "services/web/iluminate/components/lighting/designer/designer-geometry.test.ts"],
    context: [".agent/DESIGNER_HANDOFF.md", "docs/upgrade.doc"],
    validations: ["Pruebas de export SVG/DXF", "Abrir fixtures generados", "Build web"],
    keywords: ["export", "svg", "dxf", "fabricación", "corte", "router"]
  },
  {
    id: "timeline_clips", group: "animation", label: "Timeline, scenes, tracks y clips",
    summary: "Creación/selección de clips, lanes, playhead, zoom, enable/mute y edición temporal.",
    paths: ["services/web/iluminate/components/lighting/designer/designer-animate-timeline.tsx", "services/web/iluminate/components/lighting/partitura-workspace.tsx", "services/web/iluminate/lib/lighting/partitura-model.ts"],
    context: [".agent/DESIGNER_UX_CONTRACT.md", ".agent/DESIGNER_HANDOFF.md", "docs/partitura-lifecycle.md"],
    validations: ["Pruebas de colocación/selección de clips", "Smoke de timeline y playback", "Build web"],
    keywords: ["timeline", "scene", "track", "clip", "playhead", "lane", "mute"]
  },
  {
    id: "player_runtime", group: "animation", label: "Player, Worker y frames",
    summary: "Runtime precompilado, clock imperativo, backpressure de un frame, buffers reciclados y reproducción de clips.",
    paths: ["services/web/iluminate/components/lighting/player/player-surface.tsx", "services/web/iluminate/components/lighting/player/player-controller.ts", "services/web/iluminate/components/lighting/player/player-worker.ts", "services/lighting-core/player/scene-player.ts", "services/lighting-core/player/ws2812b-simulator.ts"],
    context: [".agent/EFFECT_TARGETING_MODEL.md", "docs/partitura-lifecycle.md", ".agent/DESIGNER_HANDOFF.md"],
    validations: ["Prueba de regresión del frame/clip afectado", "Pruebas de lighting-core", "Pruebas del Designer", "Build web"],
    keywords: ["player", "runtime", "worker", "emulación", "simulación", "frame", "play", "backpressure", "ws2812"]
  },
  {
    id: "optical_renderer", group: "animation", label: "Renderer WebGL2 y presentación óptica",
    summary: "Recursos GPU persistentes, píxeles directos, diffuser, Face Graphic, As built y LED map.",
    paths: ["services/web/iluminate/components/lighting/player/gpu/webgl2-player-renderer.ts", "services/web/iluminate/components/lighting/player/optical-model.ts", "services/web/iluminate/lib/lighting/visual-scene-builder.ts"],
    context: [".agent/DESIGNER_HANDOFF.md", ".agent/DESIGNER_UX_CONTRACT.md"],
    validations: ["Pruebas del renderer", "Smoke As built/LED map", "Build web"],
    keywords: ["webgl2", "renderer", "gpu", "diffuser", "as built", "led map", "buffer"]
  },
  {
    id: "effects", group: "animation", label: "Catálogo y matemáticas de efectos",
    summary: "Effect IDs, parámetros, renderers, color, ruido y efectos lineales/espaciales.",
    paths: ["services/lighting-core/domain/effects", "services/web/iluminate/lib/lighting/effect-catalog.ts", "services/web/iluminate/app/api/lighting/effects"],
    context: [".agent/EFFECT_TARGETING_MODEL.md", "docs/partitura-lifecycle.md"],
    validations: ["Pruebas de lighting-core", "Frame determinista por efecto", "Build web si cambia catálogo UI"],
    keywords: ["efecto", "pulse", "chase", "fade", "aurora", "flame", "color"]
  },
  {
    id: "compile_pixelmap", group: "domain", label: "Compile y pixelMap",
    summary: "Traversal eléctrico, serial order, muestreo espacial, memberships y compiledLayout.",
    paths: ["services/web/iluminate/components/lighting/designer/designer-compiler.ts", "services/lighting-core/pixel-map", "services/web/iluminate/components/lighting/partitura-workspace.tsx"],
    context: [".agent/PIXELMAP_COMPOSER_DIRECTION.md", ".agent/EFFECT_TARGETING_MODEL.md", "docs/partitura-lifecycle.md"],
    validations: ["Compile de fixtures", "Pruebas de pixelMap y targets", "Pruebas del Designer", "Build web"],
    keywords: ["compile", "pixelmap", "serial", "membership", "compiledlayout"]
  },
  {
    id: "partitura_model", group: "domain", label: "Modelo editable de partitura",
    summary: "DesignerForm, scenes/clips, defaults, normalización, save/reload y schemaVersion.",
    paths: ["services/web/iluminate/lib/lighting/partitura-model.ts", "services/web/iluminate/lib/server/partituras.ts", "services/web/iluminate/app/api/lighting/partituras"],
    context: ["docs/partitura-lifecycle.md", ".agent/DATABASE_MODEL.md"],
    validations: ["Pruebas de normalización y save/reload", "Pruebas del Designer", "Build web"],
    keywords: ["partitura", "document_json", "normalize", "default", "save", "reload"]
  },
  {
    id: "core_schema_validation", group: "domain", label: "Schema, generator y validator del core",
    summary: "partitura.v2, índices densos, tipos canónicos, generación, fixtures y validación determinista.",
    paths: ["services/lighting-core/domain/partituras", "services/lighting-core/schemas", "services/lighting-core/generators", "services/lighting-core/validators", "services/lighting-core/fixtures"],
    context: ["docs/partitura-lifecycle.md", ".agent/EFFECT_TARGETING_MODEL.md"],
    validations: ["npm test de services/lighting-core", "Validar fixtures válidos e inválidos", "Build del core"],
    keywords: ["schema", "validator", "generator", "fixture", "partitura.v2"]
  },
  {
    id: "persistence_database", group: "platform", label: "PostgreSQL y persistencia",
    summary: "Tablas, migraciones, repositories, document/generated JSON y aislamiento client_id.",
    paths: ["services/lighting-core/migrations", "services/auth/migrations", "services/web/iluminate/lib/server/postgres.ts", "services/web/iluminate/lib/server/partituras.ts", "services/web/iluminate/lib/server/projects.ts"],
    context: [".agent/DATABASE_MODEL.md", ".agent/FILESYSTEM_GUARDRAILS.md"],
    validations: ["Revisar migración forward/backward", "Prueba de aislamiento client_id", "Build web/core afectado"],
    keywords: ["postgres", "sql", "migración", "database", "client_id", "persistencia"]
  },
  {
    id: "auth_domain", group: "platform", label: "Dominio de identidad y permisos",
    summary: "Usuarios, organizaciones, membresías, roles, sesiones, tokens y auditoría auth.",
    paths: ["services/auth", "services/web/iluminate/app/api/auth", "services/web/iluminate/lib/api.ts"],
    context: [".agent/FILESYSTEM_GUARDRAILS.md", ".agent/DATABASE_MODEL.md", "services/auth/README.md"],
    validations: ["Pruebas de auth disponibles", "Smoke 401/403 y sesión", "Verificar client_id confiable"],
    keywords: ["auth", "usuario", "rol", "permiso", "sesión", "token", "organización"]
  },
  {
    id: "device_deployment", group: "platform", label: "Device protocol y despliegue",
    summary: "Endpoint de descarga, desired/reported state, commands, deployment y compatibilidad.",
    paths: ["services/device-protocol", "services/web/iluminate/app/api/device", "services/lighting-core/domain/deployments", "services/lighting-core/storage"],
    context: ["docs/partitura-lifecycle.md", ".agent/DATABASE_MODEL.md", "services/device-protocol/README.md"],
    validations: ["Validar payload descargable", "Prueba de estado desired/reported", "Compatibilidad de schema/core version"],
    keywords: ["device", "controller", "deploy", "download", "desired", "reported", "command"]
  },
  {
    id: "firmware_contract", group: "platform", label: "Contrato de firmware externo",
    summary: "Compatibilidad del intérprete ESP32, fixture, outputs y límites; firmware real fuera del repo.",
    paths: ["services/firmware", "services/lighting-core/fixtures", "docs/partitura-lifecycle.md"],
    context: ["docs/partitura-lifecycle.md", "services/firmware/README.md", ".agent/EFFECT_TARGETING_MODEL.md"],
    validations: ["Validar fixture partitura.v2", "Confirmar compatibilidad documentada", "Build y hardware real solo en repo externo"],
    keywords: ["firmware", "esp32", "fastled", "platformio", "fixture"]
  },
  {
    id: "scene_sharing", group: "platform", label: "Bundles, video y scene sharing",
    summary: "Player bundles inmutables, render jobs, Chromium/FFmpeg, R2 privado/público, links revocables y publicación pública.",
    paths: ["services/render-worker", "services/lighting-core/contracts/player-bundle.ts", "services/lighting-core/migrations/2026-10-07_create_scene_rendering_and_shares.sql", "services/web/iluminate/lib/lighting/player-bundle-builder.ts", "services/web/iluminate/lib/lighting/player-bundle-loader.ts", "services/web/iluminate/lib/server/scene-publication.ts", "services/web/iluminate/lib/server/scene-share-viewer.ts", "services/web/iluminate/lib/server/r2-render-artifacts.ts", "services/web/iluminate/app/api/lighting/partituras/[id]/shares", "services/web/iluminate/app/api/lighting/scene-shares", "services/web/iluminate/app/internal/render", "services/web/iluminate/app/review", "services/web/iluminate-public/app/share", "compose.yml", ".env.example"],
    context: ["docs/partitura-lifecycle.md", ".agent/DATABASE_MODEL.md", "services/render-worker/README.md", ".agent/DESIGNER_HANDOFF.md", ".agent/PUBLIC_SITE_DIRECTION.md", ".agent/EXECUTION_MAP.md"],
    validations: ["Build worker", "Build dashboard y sitio público", "Verificar aislamiento de buckets/policies", "Smoke de render y revocación"],
    keywords: ["share", "video", "render", "bundle", "r2", "cdn", "review", "unlisted", "public"]
  },
  {
    id: "public_site", group: "operations", label: "Sitio público y catálogo",
    summary: "iluminate.space, projects, templates, learning, SEO, handoff y experiencia editorial.",
    paths: ["services/web/iluminate-public"],
    context: [".agent/PUBLIC_SITE_DIRECTION.md"],
    validations: ["Typecheck, lint y build del sitio público", "Smoke responsive y rutas", "Verificar handoff a app"],
    keywords: ["public", "seo", "template", "learn", "hero", "iluminate.space"]
  },
  {
    id: "infrastructure", group: "operations", label: "Docker, Compose y producción",
    summary: "Contenedores, puertos, variables, Cloudflare, publicación, rollback y operación.",
    paths: ["compose.yml", ".env.example", "docs/production-deployment.md", "services/web/iluminate/Dockerfile", "services/web/iluminate-public/Dockerfile"],
    context: [".agent/EXECUTION_MAP.md", "docs/production-deployment.md", ".agent/FILESYSTEM_GUARDRAILS.md"],
    validations: ["docker compose config", "Build del contenedor afectado", "Smoke HTTP y plan de rollback"],
    keywords: ["docker", "compose", "deploy", "producción", "puerto", "cloudflare"]
  },
  {
    id: "context_docs", group: "operations", label: "Documentación y contexto para IA",
    summary: "AGENTS, router, contratos .agent, runbooks, mapas y manifiestos generados.",
    paths: ["AGENTS.md", ".agent", "docs"],
    context: [".agent/RULES.md"],
    validations: ["bash -n .agent/regenerar_contexto.sh", "git diff --check", "Regenerar mapas solo si cambió estructura/inventario"],
    keywords: ["agent", "prompt", "contexto", "documentación", "reglas", "guardrail"]
  }
];

export const PRESETS = [
  { id: "player", label: "Player / emulación", description: "Frames o efectos no reproducidos.", domains: ["player_runtime"], unprotect: [] },
  { id: "timeline", label: "Timeline / clips", description: "Edición temporal sin abrir player o contratos.", domains: ["timeline_clips"], unprotect: ["user_behavior"] },
  { id: "designer_ui", label: "UI del Designer", description: "Barras, Layers o herramientas visibles.", domains: ["designer_layout"], unprotect: ["ui_layout", "user_behavior"] },
  { id: "canvas", label: "Canvas", description: "Interacción Paper, zoom, pan o herramientas.", domains: ["designer_canvas"], unprotect: ["user_behavior"] },
  { id: "electrical", label: "Cableado / Compile", description: "Strings, controller, soldadura o pixelMap.", domains: ["electrical_routes", "compile_pixelmap"], unprotect: ["electrical_model", "compile_lifecycle"] },
  { id: "effects", label: "Efectos", description: "Catálogo o renderer matemático de efectos.", domains: ["effects"], unprotect: ["effect_contract"] },
  { id: "data", label: "Persistencia", description: "Partitura, PostgreSQL o migraciones.", domains: ["partitura_model", "persistence_database"], unprotect: ["partitura_schema", "database"] },
  { id: "sharing", label: "Scene sharing / renders", description: "Bundles, render worker, review y publicación pública.", domains: ["scene_sharing"], unprotect: ["user_behavior", "compile_lifecycle", "api_contract", "database", "infrastructure", "public_experience"] },
  { id: "public", label: "Sitio público", description: "Contenido, rutas o experiencia pública.", domains: ["public_site"], unprotect: ["public_experience", "ui_layout", "user_behavior"] },
  { id: "docs", label: "Contexto IA", description: "Reglas, docs y artefactos de contexto.", domains: ["context_docs"], unprotect: ["documentation"] }
];
