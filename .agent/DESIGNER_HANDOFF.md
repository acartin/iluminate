# Iluminate Designer Handoff

**Last updated:** 2026-10-26
**Purpose:** detailed current implementation handoff. Use the context router in
`.agent/RULES.md` and read only the headings relevant to the task instead of
loading this complete file by default.

## Current State

The fabrication upgrade in `docs/upgrade.doc` has completed phases 0–10. Face
Graphic is now a native authoring layer, and geometric layers support
associative projections, compound paths, live offsets, live fillets and
deterministic text outlines. Animate now applies Face Graphic as a physical
filter over an isolated front-light buffer, and Design exports validated SVG
and DXF fabrication interchange at physical scale. Animate now uses the
partitura.v2 Worker + persistent WebGL2 player; embedded and expanded viewer are
the same mounted surface.

Iluminate now has a first-pass full-screen graphical Designer for routing a real sign:

```text
Designer grid
-> select partitura
-> full-screen canvas
-> draw/edit zones
-> draw/edit LED strings and data cables
-> snap/solder terminals
-> compile electrical topology and pixelMap
-> resolve zones/groups into effect targets
```

The Designer is intentionally fabrication-oriented. It is not a raw matrix editor and it is not the old technical Layout tab.

## Primary Routes And Files

- Grid entry: `/partituras/designer`
- Full-screen editor: `/partituras/designer/[id]`
- Workspace shell / tabs: `services/web/iluminate/components/lighting/partitura-workspace.tsx`
- Designer modules: `services/web/iluminate/components/lighting/designer/`
  - `types.ts`: shared Designer UI/canvas types.
  - `designer-paper-canvas.tsx`: canvas host, Paper.js loading, pointer interactions, pan/zoom drag plumbing.
  - `designer-paper-renderer.ts`: Paper.js drawing for grid, build areas, zones, routes, controller, terminals and labels.
  - `designer-geometry.ts`: compatibility barrel while callers migrate from the former mixed helper module.
  - `geometry/designer-geometry-engine.ts`: public API for layer-agnostic vector operations.
  - `geometry/designer-geometry-commands.ts`: pure canonical geometry command boundary.
  - `electrical/designer-electrical-engine.ts`: electrical route, port, joint and topology API.
  - `canvas/designer-tool-policy.ts`: common geometric tool mapping and layer permissions.
  - `designer-compiler.ts`: compiles visual routes into the physical pixelMap and resolves visual targets from zones/groups.
  - `designer-ui.tsx`: toolbox buttons, contextual fields, layers panel and rulers.
- Player modules: `services/web/iluminate/components/lighting/player/`
  - `player-surface.tsx`: single embedded/expanded Animate surface; owns viewport, visibility and renderer lifetime.
  - `player-controller.ts`: imperative playback clock, one-frame backpressure and Worker buffer recycling.
  - `player-worker.ts`: prepared partitura runtime and reusable RGB frame evaluation.
  - `gpu/webgl2-player-renderer.ts`: persistent instanced WebGL2 rendering and Face Graphic transmission.
  - `render-harness.tsx`: deterministic headless entry used by the video worker.
  - `optical-model.ts`: shared optical-model types and defaults.
- Designer fabrication modules: `services/web/iluminate/components/lighting/designer/fabrication/`
  - `designer-fabrication-export.ts`: canonical validation plus 1:1 SVG and metric DXF serialization.
- Grid wrapper: `services/web/iluminate/components/lighting/partitura-designer-workbench.tsx`
- Model/defaults/normalization: `services/web/iluminate/lib/lighting/partitura-model.ts`
- Derived offset/fillet engine: `services/web/iluminate/lib/lighting/designer-derived-geometry.ts`
- Controlled font catalog: `services/web/iluminate/lib/lighting/designer-font-catalog.ts`
- Text outline engine: `services/web/iluminate/lib/lighting/designer-text-geometry.ts`
- Controlled font endpoint: `services/web/iluminate/app/api/lighting/fonts/[fontId]/route.ts`
- Server persistence: `services/web/iluminate/lib/server/partituras.ts`
- Menu config: `services/web/iluminate/lib/api.ts`
- Sidebar icon/style: `services/web/iluminate/components/portal/sidebar.tsx`

## Graphics Engine Decision

### Canonical geometry checkpoint

Normalized documents now write `designerSchemaVersion: 22`. Version 2 introduced
the canonical `designer.geometries` collection and stable `geometryId`
references; version 3 added the Designer-wide CNC cutter diameter/display unit,
version 4 added the persisted Channel router-bit diameter, version 5 briefly
carried profile bend metadata, version 6 removed that duplicate input and
derived the fabrication radius solely from half the router-bit diameter;
version 8 replaces the temporary unit preference with one bilingual bit preset;
version 9 introduced `filletRadiusMm`; the field now retains the last Custom
direct-fillet radius across Save/reload. Version 12 added native offset defaults;
version 14 adds same-layer vector authoring groups, kept
separate from electrical/effect Zone groups. Version 15 adds the Channel
`fabricationSurface` (`front` or `rear`), defaulting legacy Channels to `front`;
it is fabrication metadata and remains outside electrical and optical
compilation. Fillet radius is no longer exposed in Setup; live derived profiles persist
their own radius and Channel corner nodes persist `radiusMm` directly.
Version 20 adds authoring-only fixed-sublayer masks and persistent user
sublayers; neither participates in compilation or fabrication output.
Version 21 removes the obsolete Face Graphic and Diffusors visibility-preset
collections and the fixed Face Graphic `Elements` mask; Layers eyes are the
only visibility model.
Version 22 replaces the single-owner string relation with `diffuserMapping`.
`auto` admits every geometrically intersecting Zone or Channel on the string's
construction side; `restricted` admits only intersections whose target appears
in its ordered target list. One physical string may therefore illuminate any
number of independent diffuser Zones without bypassing their geometry.
Legacy documents receive the 3.175 mm (1/8 in) cutter default during
normalization. For compatibility with the current Paper renderer, semantic
records still carry synchronized inline bounds/points; on load canonical
geometry is authoritative, and every workspace mutation commits the
compatibility view back through `canonicalizeDesignerGeometry`.

Do not bypass that mutation boundary or introduce a second geometry model.
Face Graphic references this same canonical geometry collection.
Channel width, caps, Bezier handles and node `radiusMm` resolve through one
physical-profile function. Designer, fabrication export and `visual-scene.v1`
consume those resolved contours. Animate renderers must draw the supplied
contours and must never reconstruct a Channel from its center line.

### Face Graphic authoring

`designer.faceGraphics` contains native front-face mask/vinyl objects. Each
object references canonical geometry and owns only `passMode` (`opaque`,
`clear`, `translucent`) plus `filterColor`; it has no LED, diffusion or effect
properties. The Layers panel exposes `Face Graphic` as its own category and the
left rail reuses rectangle, ellipse, polygon and Bezier authoring. Magenta
shapes in Design are a fabrication preview, not the final optical calculation.
Design also offers an ephemeral black/white vinyl preview from the Face Graphic
Layers header. It resolves native and live-derived physical regions in layer
order, maps opaque/uncovered material to black and clear/translucent openings to
white, and preserves selection overlays. Linked projections remain construction
references and are omitted from this mode. The toggle is component state only:
it must not enter the document, compile signature, export or Animate renderer.

Face Graphic is deliberately omitted from `designerCompileSignature`, compiled
zones, pixelMap, groups and wiring. Editing it must not make a valid electrical
Compile stale. In `As built`, the renderer separates rear/external light from
front light, generates a viewport-aligned RGB transmission texture from the
vector Face Graphic, and filters only the front buffer. Outside the defined
graphic is opaque; the topmost persisted object wins overlaps. Compound holes
remain openings according to their enclosing region. Object visibility controls
membership in both the vinyl preview and the optical transmission mask; layer
visibility and opacity remain editor aids.
Category, sublayer and object eyes are the only visibility model in Layers.
There are no category visibility-preset collections in the normalized document.
Direct-mounted Front pixels participate in this pass. `LED map` bypasses it and
continues to show raw mapped output. Never replace this with a top-level
multiply overlay: it would incorrectly affect Halo, Wall Wash and the workspace
background.

### Project Geometry and legacy projections

The contextual `Project Geometry` command resolves the selected canonical
source once and immediately creates an independent native build area, Zone or
Face Graphic object. It does not add a `designer.projections` record, expose a
`Break Link` step or retain a source dependency. The command reveals and
target layer but preserves the source layer and source selection so the operator
can project successive objects without navigating back. Because this is an
explicit cross-layer creation command, it may append the new object while the
target layer is locked; the lock continues to protect existing geometry and
subsequent editing.

`designer.projections` remains supported for legacy documents as linked,
read-only references with stable IDs, `sourceGeometryId` and `targetLayer`.
Resolve those records through `resolveDesignerProjectionGeometry`; missing
sources remain recoverable through the contextual source selector and cycles
remain invalid. New authoring must not create more linked projection records.

`Fabrication Plans` is a separate strict authoring category for geometry that
has already been assigned to a physical piece but has not yet been exported.
A `Fabrication Part` records the piece name, material, thickness, machining
side and visibility/lock state. Projecting to this category creates an
independent `Fabrication Path` under an existing or newly named part and assigns
one operation (`cut`, `pocket`, `drill`, `engrave` or `reference`). These paths
are materialized snapshots and never participate in optical/electrical Compile
or Animate.
When Diffusors is active, visible Fabrication Paths are also rendered above it
as a non-interactive magenta dashed overlay labeled with the physical part and
operation. The Fabrication Plans visibility eye controls this orthogonal
feedback; editing and selection remain exclusive to the Fabrication Plans
category.

### Fabrication export

The Design global bar exposes `Export`. Its modal selects Reference/substrate,
Diffusors, Face Graphic and Fabrication Plans output categories, DXF curve
tolerance and minimum-feature guidance. Both download actions run the same
validation pass; errors block the file while warnings remain downloadable.
Each visible Fabrication Part becomes its own SVG or DXF and uses the exact
operator-defined part name as the download base name; its visible paths are
grouped by `cut`, `pocket`, `drill`, `engrave` or `reference` operation.

SVG is millimeter-based, path-only, preserves native Beziers and compound
contours, and produces separate files for Reference, Zones, Channels and Face
Graphic; Face Graphic pass/color remains grouped inside its file. The Channels
file contains only the canonical centerline as the router-bit toolpath, not its
derived swept outline. DXF uses `$INSUNITS=4`, named operation/material layers
and deterministic `LWPOLYLINE` flattening, preserving open or closed centerline
topology. Controlled editable text is outlined in memory and is not changed in
the document. When global alignment marks are included, the same orthogonal
calibration set is repeated in every selected file under
`ALIGNMENT_GUIDES_NO_CUT`, with its exact millimeter spacing in metadata. Live
derived profiles are exported; linked
projections, images, controller, routes, LEDs, selection visuals and other
editor guides are excluded. Broken projections warn because they are
construction-only; broken derived operations and unresolved fonts block.

Every file carries partitura/project identity, generation time and a SHA-256
source checksum. Export does not require or change electrical Compile and does
not create firmware/toolpaths. PDF, EPS, STL and proprietary cutter formats
remain outside the implemented contract.

Alignment/calibration marks are configured in `Setup` as one Designer-global
orthogonal set (enabled, locked, origin and exact spacing; 100 mm by default).
They remain visible and movable as a group on every Design layer. Export can
include or exclude them independently; they are three non-collinear crosshair
targets (origin, +X and +Y), represented by six open no-cut lines. The
external-software operator is responsible for removing them before machining.

Projections are construction references: keep them out of electrical Compile,
pixelMap and fabrication export unless the operator explicitly materializes or
derives geometry from them.

### Work lines

`designer.workLines` stores persistent open construction polylines. Each line
has a stable ID, editable name and points. All legacy ownership values normalize
to `artwork`, and every existing or new line is displayed inside the dedicated
`Work Lines` folder under `Artwork`. One `designer.workLinesVisible` flag shows
or hides the collection, while the Artwork master eye controls Images,
Reference and Work Lines together. Each of those three folders also has its own
eye, which applies one visibility state to every object in that folder.

The Work Line tool remains available from the geometric authoring layers, but
completion and later selection activate `Artwork` and expand its `Work Lines`
folder so the persisted destination is immediately visible.

Work lines render as continuous strokes in a distinct teal color over filled canvas objects
so the reference and its selected-state nodes remain legible. They are tested
only after productive geometry, so they cannot steal an initial overlapping
click; selecting their row intentionally gives that line's path and nodes edit
priority. Their nodes and complete path are movable and deletable. They use
straight open segments, are excluded from canonical fabrication geometry,
electrical Compile, pixelMap, Animate and SVG/DXF export, and never become a
projection or derived-operation source.

Selecting a Work Line exposes `Generate Holes`. The command finds unique
intersections between distinct Work Line polylines and creates one independent
`clear` ellipse in Face Graphic at each crossing. These holes are native,
editable Face Graphic objects with no link to break. Their persisted diameter
comes from Setup's `Hole diameter` value in millimeters. Generated hole circles
retain `clear` semantics but render with a continuous outline. Generation is
idempotent by crossing coordinate: a crossing that already contains a generated
Work Line hole is skipped, independently of the current configured diameter.

### Compound paths and booleans

Canonical `DesignerGeometry` paths may contain `contours`; the collection
includes the outer profile and every hole/island, while `fillRule: "evenodd"`
determines filled material. Semantic build-area, zone and Face Graphic records
carry a synchronized compatibility view. Rendering, canvas containment and zone
pixel mapping all honor these contours.

The shared implementation lives in
`geometry/designer-geometry-boolean.ts`. It owns `Union`, `Subtract`,
`Intersect`, `Exclude`, Paper.js conversion/serialization and topology
validation. Do not reproduce boolean logic in a layer component. The UI creates
a same-layer operand list with Shift/Ctrl/Command-click. Multiple selection has
an exclusive contextual state: it replaces the last object's properties and
single-object commands with a count plus compact icon-and-label `Group`, `Union`,
`Subtract`, `Intersect` and `Exclude` controls. Native vectors from one layer may
be persisted in `designer.vectorGroups`; selecting any member restores the whole
selection and Move translates the members together. `Ungroup` removes only that
authoring relationship. These groups never compile, alter geometry, or reuse
`designer.groups`, which remains the electrical/effect Zone-group contract.
Subtract uses selection
order: first profile minus subsequent profiles. Native operands are consumed;
linked projections used as operands remain intact. One Undo reverses the whole
operation.

Boolean results can be moved and resized as complete profiles. Phase 5 does not
expose direct per-contour node editing. Self-intersections, duplicate contours,
open profiles and empty results are rejected. Zone contour changes invalidate
Compile because they change pixel membership; Reference and Face Graphic
booleans remain electrically neutral.

A selected native path exposes `Trim` as a selection-dependent pointer tool in
the left rail. Its active guidance remains contextual. Paper.js resolves its
crossing graph into exact closed faces: hovering inside or along a face previews
that face in red, the surviving profile in cyan and the source intersections in
amber. Selection is deterministic (smallest containing face, then nearest
stroke), not inferred from path traversal order. Clicking commits one closed
result as one Undo transaction; remaining resolved faces stay selectable for
subsequent Trim passes, including after the result becomes compound; `Esc`
cancels. It is shared by Reference, Zones and Face Graphic and does not flatten
Bezier curves. Channels also expose `Trim`; the selected crossing loop is
removed from the editable center trace while the Channel remains one native
path with the same width, cap, identity and open/closed state.

Compound paths remain directly node-editable after Trim. Designer draws nodes
for every contour, maps selection to a stable flattened point index and reports
the local contour/point in the contextual bar. Point, node-type and Bezier-
handle edits mutate only the selected contour while keeping contour zero synced
with the legacy `points` projection.

### Derived offset and fillet geometry

New `Offset Path` operations resolve once and immediately materialize an
independent native object in the source target layer. The signed
`offsetDistanceMm` and `offsetJoin` authoring defaults are persisted on
`DesignerForm`, shown before execution and reused by the next operation. New
offsets never add a `designer.derivedGeometries` record or require `Break Link`.
While a newly created native offset remains selected, changing either setting
recalculates that same object directly from an in-memory snapshot of its
creation profile. This transient editing aid is not a persisted source link;
the saved object remains independent native geometry.

`designer.derivedGeometries` remains compatible with legacy non-destructive
`offset` and `fillet` operations. Each record points to canonical geometry, a
projection or an earlier derived result through `sourceGeometryId`, keeps its
target layer, and stores only operation parameters. Resolve it through
`resolveDesignerGeometryReference` / `resolveDesignerDerivedGeometry`; do not
snapshot source coordinates into the operation record.

The shared calculation is in
`lib/lighting/designer-derived-geometry.ts`. Offsets use signed millimeter
distances and `round`, `miter` or `bevel` joins. Miter joins retain the exact
angular intersection; the legacy persisted miter limit remains readable for
document compatibility but must not silently replace an acute corner with a
bevel segment. Offset polylines are simplified adaptively: every candidate must
preserve contour orientation and remain free of self-intersections; the engine
reduces tolerance when necessary and retains the unsimplified valid contour as
the final fallback. Fillets on linked/read-only sources persist a millimeter radius
and may persist a canonical corner-index selection as a live derived profile.
Native Reference, Zone and Face Graphic paths instead expose `Fillet` as a
selection-dependent pointer tool in the left rail: every corner click mutates the same
native object, records one Undo step and leaves the tool active until `Esc` or
another tool. No preview, Apply, derived object or Break Link participates in
that native workflow. A corner selected before tool activation receives the
current radius immediately and remains selected. After applying a fillet,
changing `Radius` while that exact node remains selected recalculates it from its
pre-fillet geometry; it does not stack another fillet, and zero restores the
corner. This edit context is transient and creates no persisted link. Direct
native Fillet trims/recalculates the adjacent geometry and preserves the exact
requested radius. It never substitutes the smaller maximum radius; when needed,
the local Bezier joins are adjusted. On dense materialized/offset polylines it
consumes every intermediate sampling node covered by the requested tangent span
instead of folding the arc over the two immediate micro-segments. A
self-tagged smooth node that still forms a visible anchor corner may fall back
to those support legs; exact circular fillet spans remain protected from a
second stacked fillet. A
self-intersecting result is rejected
without changing geometry. A visible status beside the active Fillet controls
reports the result; an unusable node remains unchanged. Channels instead keep
an optional `radiusMm` on the selected canonical corner node; the contextual
`Fillet` field updates the center trace directly with no tool-activation step
or derived record. The engine emits cubic Bezier arc segments
instead of fixed-angle straight chords. It trims line–Bezier or Bezier–Bezier
cusps at numerically solved tangent points, preserves the unaffected curve
segments, and skips joins whose tangents are already continuous. SVG therefore
retains smooth `C` curves; DXF alone flattens them using the operator's export
tolerance. Both calculation paths preserve open/closed topology. Fillet radii
clamp to short legs with an explicit warning. Collapsed inward offsets, invalid
topology, broken sources and cycles stay persisted and selectable so the
operator can repair the parameters or source.

`fabricationCutterDiameterMm` is the canonical physical diameter and defaults
to 3.175 mm; `fabricationCutterUnit` (`mm`, `in` or `cm`) controls only Setup
display/input. These are contour-design constraints, not CAM settings: they do
not affect Compile, offset the exported contour or generate toolpaths.

Legacy derived chains are live and acyclic. A source edit must immediately recalculate
projection → offset → fillet descendants. Use
`wouldCreateDesignerDerivedGeometryCycle` before relinking. Derived profiles
are amber and read-only on canvas; `Break Link` is retained only for a valid
legacy live Fillet. Legacy offsets can be copied into native geometry with the
normal `Project Geometry` command. They remain outside the electrical Compile
signature and pixelMap until materialized.

When a derived profile targets Face Graphic it also owns only `passMode` and
`filterColor`, with translucent white defaults. Those values follow chained
operations, survive normalization, drive the As built frontal-light filter and
select the SVG/DXF material group. Hidden derived profiles are excluded from
both the vinyl preview and the physical mask.
Breaking the link transfers the same mask values to the resulting native Face
Graphic object. Linked projections themselves remain construction-only.

Normalization distinguishes an absent legacy collection from an explicitly
empty authored collection. In particular, saved `zones: []` and `routes: []`
must never restore the example sign or example wiring. Current schema
normalization is idempotent and must preserve canonical geometry and electrical
topology across repeated save/reload cycles.

### Controlled text and outlines

`designer.texts` persists editable text separately from canonical path geometry.
Each record carries content, target layer, font ID plus SHA-256, size and
tracking in millimeters, line height, alignment, position, visibility and lock.
Persisted text can live in Reference, Diffusors or Face Graphic, but the Text
creation tool is currently hidden in every geometric layer. Rendering,
selection, editing and conversion remain available for document compatibility.

The only valid fonts are declared in `designer-font-catalog.ts` and served from
the pinned `@fontsource/roboto` package. Never fall back to an OS font for
manufacturing geometry or reuse a font ID for different bytes. The API endpoint
is immutable and the client verifies SHA-256 before conversion.

`designer-text-geometry.ts` owns glyph shaping, kerning, tracking, multiline
layout, alignment and OpenType-command conversion. `Convert to paths` produces
ordinary compound Bezier geometry with `evenodd` holes, removes the editable
text in the same Undo transaction and creates a native build area, zone or Face
Graphic object. Do not create a separate outline format. Editable text remains
electrically neutral; a converted Zone has the normal Compile behavior.

The Designer canvas now uses an HTML `<canvas>` rendered by Paper.js. The surrounding React UI, domain model, snap/solder logic and persistence still use Iluminate `DesignerForm`.

The selected vector editing engine for the next Designer migration is **Paper.js**:

- Runtime dependency: `paper`.
- TypeScript dependency: `@types/paper`.
- Installed in `services/web/iluminate/package.json`, so Docker rebuilds include it through `npm ci`.
- Browser bundle served from `services/web/iluminate/public/vendor/paper-core.min.js` and loaded through `window.paper` to avoid Next/Turbopack SSR resolving Paper's Node/jsdom path.
- Paper.js is the editing/rendering engine for vector work: straight polygons, Bezier paths, path segments, handles, hit testing and node insertion/deletion. Freehand smoothing and trace tooling remain future work.
- The persisted format must remain the Iluminate `DesignerForm`/partitura domain JSON. Do not persist Paper.js private project JSON as the source of truth.
- The previous SVG renderer was removed from `components/lighting`. Do not reintroduce SVG canvas components for Designer behavior. SVG files are still acceptable as imported reference artwork later, but not as the editor engine.

## Current Persisted Record

The active/default partitura in local Postgres is:

```text
id: 1
partitura_key: default_installation
name: Default Installation
status: draft
designer.canvasWidthCm: 170
designer.canvasHeightCm: 40
designer.controller: x=4, y=4, width=12, height=12, dataOutputs=3
generated_json: null after reset
```

The duplicate `default_installation_2` was soft-deleted. Keep `partitura_key=default_installation` stable because the ESP32 download flow may use `/api/device/partituras/default_installation`.

## Designer Defaults

New persisted partituras should start with:

- Controller card near upper-left: `x=4`, `y=4`.
- A clear left strip for controller/cable work.
- No default artwork, build areas, zones, channels, light sources, routes or clips.
- One empty `Normal` scene so authoring can begin without demo content.
- Canvas width `170 cm`, height `40 cm`.
- Addressable density `60 Pixels/m`.
- Physical emitter density `60 LEDs/m`.
- Derived physical ratio defaults to `1 LED/px`.
- Snap `2 cm`.
- Three controller outputs by default.

`createDefaultPartituraDocument()` remains the populated demo/test fixture. It is
not used when persisting a new partitura. Existing persisted documents are not
rewritten by this creation behavior.

## Visual Vocabulary

### Addressable Pixels vs Physical LEDs

Do not assume one addressable pixel is always one physical LED.

- `Pixels/m` means addressable WS281x pixels per meter. This is the density used to sample LED routes, output counts, serial indices, pixelMap rows and firmware frames.
- `LEDs/m` means physical light emitters per meter. This is used by the Designer/simulator to preview how a real 5V, 12V or 24V strip may look.
- `LED package` is the physical square emitter footprint in millimeters. It defaults to 5 mm (5050), is drawn at physical scale in Design and supplies the footprint used for Channel membership.
- `PCB width` is the physical strip-board width in millimeters. It defaults to 10 mm and is rendered at physical scale behind the light sources.
- `LEDs/px` is an independently persisted manufacturer fact. Examples: WS2812B 5V is normally `1 LED/px`; many WS2811 12V strips are around `3 LEDs/px`; some 24V strips may be around `6 LEDs/px`.
- The firmware still emits WS281x frames by addressable pixel. Electrical implementation beyond the data output is not part of the partitura contract.

Setup selects a PostgreSQL-backed LED-strip profile and applies it as a resolved
`designer.stripConfiguration` snapshot. Catalog id/revision is provenance only:
Save persists the copied values and Compile consumes only the partitura JSON.
Applying a profile preserves routes and invalidates stale compile/generated
state. Preset selection and manual LED-strip edits first update a transient live
canvas preview. `Apply changes` copies that preview into the editable partitura;
`Cancel` or closing Setup discards it. The global `Save` remains the only action
that persists the resulting partitura to the database. Other Setup sections
retain their existing live-edit behavior. The canvas renders the configured PCB width and either discrete LED
packages or a continuous COB band. `marked_segments` profiles render physical
cut marks at `cutSegmentLengthMm` intervals; `free_cut` profiles show neither
an interval control nor cut marks. COB construction alone never implies free
cutting. Setup exposes this mode only for continuous strips. Discrete strips
show four independently editable commercial facts: `Pixels/m`, `LEDs/m`,
`physicalLedsPerAddressablePixel` as `LEDs / pixel`, and
`physicalLedsPerCutSegment` as `LEDs / cut`. No edit silently recalculates
another field. Their millimeter cut interval is calculated only by the canvas
as `1000 × LEDs/cut ÷ LEDs/m`; it is neither required from the operator nor
written back into the discrete-strip snapshot. Continuous marked-cut products
keep their explicit manufacturer interval.

### Canvas Layers

The Designer separates five persisted visual layers:

- `Artwork`: imported client/project image assets placed on the canvas. It renders image references only, does not duplicate/upload assets, and does not generate LEDs. Each item persists `assetId`, name and rectangle. Older JSON may still contain item-level visibility/lock/opacity fields, but the UI/rendering policy is to control visibility, lock and opacity at the layer/category level only.
- `Reference`: measured construction/reference geometry such as build areas. It does not generate LEDs. In the panel it is presented as a `Reference` folder inside the `Artwork` category. The folder has no header eye/lock/opacity; the `Artwork` category eye/lock governs the reference plane as its master, and each build area's own eye refines it. Rendered as a violet dashed guide.
- Work lines are globally visible/hidden construction-only open polylines.
  They may retain an organizational owner from Artwork, Diffusors or Face
  Graphic and appear directly in that category, or remain global. They select
  after productive objects unless the operator intentionally selected the line.
- `Zones`: visual targets such as letters, logos, background and full sign.
- `Channels`: routed lighting or fabrication paths belonging to the Zones plane. A channel reuses the
  Bezier trajectory as an editable center line and derives two parallel borders
  from a width. Its `fabricationSurface` identifies the physical face machined
  by the router independently from Front/Halo/Wall Wash Lighting Setup. It
  behaves as a zone for pixel mapping and effects.
- `Hardware`: the Layers category groups the physical construction rows into
  `Strings`, `Data cables` and `Controller` folders. The controller is drawn as
  a small PCB (board, two cosmetic chips and a status dot); the chips are
  visual only and do not change behavior.
- `Strings`: persisted physical fabrication plane containing LED strings, data
  cables, terminals and joints (no controller). It remains distinct from the
  persisted controller layer even though both appear under the `Hardware`
  category in Layers.
  Routes also carry `designSurface: rear | front`, a mounting and electrical-plane
  classification normalized to `rear` for legacy documents. Hardware's shared
  transient `Rear / Front / Both` filter applies that classification to route
  rendering, hit testing, snapping and folder rows in Design. The transient
  filter itself never changes authored data, but the persisted classification
  isolates terminal joints and serial traversal by plane and therefore belongs
  to the compile signature. It remains outside optical setup, Animate rendering
  and fabrication output.

`Light Sources` is deliberately absent from Layers. The persisted
`designer.lightSources` collection currently stores what the product calls
Lighting Setups: Front, Halo-Lit or Wall Washer configuration owned by a zone
or channel. Compile derives their physical LED strings from orthogonal pixel
membership, construction surface and the string's Diffuser mapping;
persisted `stringIds` is a compiled
compatibility cache, never an operator-authored assignment. These records have no
independent canvas geometry or drawing tool, so they are not an activatable
canvas plane. Do not restore that category. Keep the legacy persisted name only
for backward compatibility until an explicit model migration is designed.

Each Zone and Channel row has a visible lightbulb action that selects the owner
and opens its Lighting Setup modal. The contextual bar does not repeat that
modal button; it shows read-only mounting/material status icons. The modal
shows the strings calculated by the current Compile as read-only information.
The Layers lightbulb turns amber whenever the owner has at least one enabled
Lighting Setup; that status is persisted configuration and never depends on
Compile freshness or compiled string membership. Enabled records without strings
still show an incomplete warning inside the setup instead of pretending that
Front/Halo/Wall Washer is installed. Zone/channel rows omit their geometry
description. Zone geometry is edited on the canvas and its contextual bar
exposes only selected-node properties; Channel path properties remain
contextual.

Each layer has `visible`, `locked` and `opacity`. Hidden layers do not render or receive selection. Locked layers remain visible and selectable for inspection, but cannot be moved, resized, deleted or edited from the canvas/toolbox/contextual properties. The contextual bar does not repeat the selected object name, active category or locked state; Layers remains the source of that context. Each object row also exposes a per-object visibility eye (like the layer header): hidden objects do not render and are not hit-tested. Per-object lock and opacity remain layer-level only.

Electrical/effect `Groups` are not a canvas layer and have no geometry. They are authored in the fixed `Effect targets` collection directly under Diffusors, as a sibling of Zones and Channels: a named, cycle-free composition of Zones, Channels and/or other groups. The three siblings share one drag/drop context; Effect targets must not be implemented as a child or portal of Zones. Zones and Channels enter through the same multi-select drag/drop flow and retain their respective icons and colors. In Animate, `+ Clip` uses the selected canvas object's only available destination directly, scopes the searchable chooser to that object when it has multiple destinations, and opens the complete chooser when there is no canvas selection. The chooser remains split first by Front/Rear and then by Effect targets, Zones, Channels and Global. A group choice compiles to the validator-safe id `effect_target_<front|rear>_<groupId>` and includes only the enabled mapped light sources for that side, while the neutral authoring group remains persisted in `designer.groups`. A clip that targets a group applies its effect to the union of the resolved member pixels, respecting each member's geometry, and behaves as one composition across the group's bounds. Whole-sign composition is achieved by grouping the desired targets. The clip `coordinateSpace` control was removed from the UI; clips are authored as `"local"` and the core still accepts/validates `serial`/`local`/`global`. Groups compile into `compiledLayout.groups`; Channels are converted to the core's zone-compatible runtime member type without losing their authoring identity. Groups are unrelated to non-compiling `designer.vectorGroups` used for authoring selection and movement.

### Channel Tool

`Channel` is a Zones-plane tool for neon-flex routing. The operator traces the
center line with the same point-by-point workflow as the Zone path tool, then
finishes with a double-click or `Enter` (open ends) or by clicking the first
node (closed loop). `Enter` finishes and deselects the current open Channel but
keeps the Channel tool active, so the next click begins a new Channel. The operator
only edits the center nodes and Bezier handles; the two parallel borders are
derived and are never manipulated separately.

Manual tracing remains the default. The active Channel context can also create
independent Channels from selected canonical profiles, aligned on the source
center, left edge or right edge, or at a numeric offset inside or outside a
closed profile. Inside/outside is semantic rather than dependent on winding
direction. The prospective offset is previewed on the canvas; an inward offset
that collapses is rejected. Open profiles are joined only when endpoints
coincide within the fixed geometry tolerance; disconnected components become
separate Channels. A node with more than two incident paths is a branch and is
rejected rather than guessing fabrication intent. The operator traces each
branch as a separate Channel. The contextual action is labeled `Generate
Channel`, and a Channel generated from one Zone inherits that Zone's name.

- Persisted form is `designer.channels` with the center `points`, `pathMode`,
  `widthMm` (3-20 mm), explicit `closed` topology and endpoint `cap`
  (`butt` / `round`) plus `fabricationSurface` (`front` / `rear`). Legacy
  Channels without a surface normalize to `front`. Legacy documents that encoded closure as `cap: "closed"`
  are normalized to `closed: true` plus `cap: "butt"`. The generated band is
  never stored, only the center trajectory, topology and width.
- `channelBorderPolylines` derives independent left/right borders for a closed
  band; `openChannelOutline` derives the capped polygon for an open band;
  `channelContainsPoint` selects pixels by distance to the center line.
- Removing the last Bezier handle must never change channel topology. Paper and
  the WebGL2 player must both respect the same explicit `closed` flag.
- On compile, channels are emitted as zones in `compiledLayout.zones` (and join
  the `full_sign` group), so their light sources are available as clip targets.
  They appear under Channels in Animate's target chooser; canvas selection is
  useful for inspection but is not required to create a clip.
- Timeline selection is bidirectional: clicking a clip keeps it selected and
  selects/highlights its owning zone or channel on the Animate canvas. Because
  current clips target a Front/Halo-Lit/Wall Washer source ID, resolve the
  source `targetType`/`targetId`; never select the non-geometric source record
  as a substitute for its owner. Direct legacy zone/channel clip targets remain
  supported, and changing the clip Target performs the same synchronization.
- The Layers panel `Channels` section selects, renames, deletes and edits width
  and ends of each channel. Channel rows are sortable like Zone rows. Array
  index 0 is the visual foreground and hit-test priority; Channels remain in
  front of Zones when the two kinds overlap. Width and ends also appear in the
  top contextual bar when a channel is selected.
- Setup configures the persisted Channel router-bit diameter through one
  selector of common metric and fractional-inch sizes. Every option shows both
  units and millimeters remain canonical. The draft renders at that physical
  width and a finished Channel copies it into `widthMm`; existing Channels are
  not retroactively changed and the general CNC cutter setting remains
  independent. Do not duplicate this selector in the contextual bar.
- The Layers-panel header owns one stable `Construction · Front / Rear / Both` viewport filter
  shared by Channels, LED strings and data cables. A single-side view determines
  the surface of newly traced or generated Channels; in `Both`, the Channel
  context exposes `Create on` and remembers the last explicit side. Changing a
  selected Channel's fabrication side switches the viewport to that side.
  Zones and groups have no surface and remain available in every view. New Zones
  receive a Front setup by default; a new Front Channel receives Front and a new
  Rear Channel receives Halo. These are editable defaults, not permanent
  constraints; Wall Washer remains explicit.
- New open channels default to `cap: "round"`, matching the semicircular end
  left by a single center-line router pass (`radius = widthMm / 2`). `Butt`
  remains an explicit edit for workflows that trim or extend the groove.
- Designer performs no generic Channel bend-radius estimation or warning.
  Handle dragging remains free and is frame-batched. Selecting a corner node
  exposes one numeric `Fillet` field in
  millimeters; changing it redraws the Channel center trace immediately and
  zero removes it. Do not add a second Fillet activation button, a passive
  Fillet badge, a Setup radius or a separate `Round corner` control.
- Channel borders are the swept footprint of the circular router bit along the
  authoritative center path. At a sharp turn the outer side is a bit-radius arc
  and the inner side is the intersection of the two offset legs. Do not round,
  miter or otherwise edit both borders independently.
- `Project Geometry` accepts a selected Channel without introducing another
  command. The Channel remains the centerline object. A Fabrication Plans
  destination receives an independent snapshot of that canonical open or
  closed centerline as the CNC router-bit path. Area destinations receive the
  swept outline used by Designer and Animate; projecting to Face Graphic thus
  supplies a closed perimeter without changing the active layer or selection.
- A selected Channel can generate an independent LED string on its sampled
  centerline, in forward or reverse direction, and inherits the Channel's
  construction surface. For a closed Channel, the selected Channel node (or the
  first node when none is selected) becomes the coincident DIN/DOUT seam. The
  generated string has no live dependency on the Channel, so either object may
  subsequently be edited or deleted without changing the other. Designer warns
  when the configured strip PCB is wider than the Channel.
- A selected Zone exposes one shared alignment configuration for Channel and
  LED-string generation: `Left edge`, `Center`, `Right edge`, `Inside offset`
  and `Outside offset`; the last two expose one shared non-negative distance.
  Edge alignment uses each result's physical width (router diameter for a
  Channel and PCB width for a string). The signed `Offset Path` distance and
  join remain independent and affect only `Offset Path`. Zone-generated strings
  receive a restricted Diffuser mapping to that Zone and appear under
  Hardware / Strings. String generation preserves the selected source Zone and
  its active Layers destination. Channels and strings are materialized
  snapshots; neither retains a live geometric dependency on the Zone.
- A selected closed Channel can also `Generate lightbox Zone`. Designer finds
  the smallest valid closed profile containing the complete swept Channel
  footprint, materializes the region bounded by the Channel's physical inner
  edge as an independent native Zone and selects it. Closed Channels fully
  contained by that region on the same fabrication surface are auto-detected
  and their complete physical outer footprints become even-odd holes. This
  prevents the lightbox fill from overlapping internal front-light channels.
  The source profile and Channels remain unchanged and no live dependency is
  stored. The generated
  name is always `<containing profile name> lightbox`; collisions append the
  first available numeric suffix beginning at `2`. Open Channels, collapsed
  inner regions and Channels without a containing closed profile are rejected
  without modifying the document.

### Artwork Tool

`Artwork` is the umbrella plane for visual references. Activating the category
(or either of its `Images` / `Reference` folders) exposes two toolbar groups:

- `Images`: the `Image` tool (`image_place`). Arm it, then click the canvas to
  place an **empty image container** at that point; the container is selected.
  Choose its image afterwards from the `Image source` dropdown in the `Images`
  folder (populated from the project assets). Asset-less containers render as a
  dashed placeholder on the canvas. Assigning a source replaces the placeholder
  dimensions with the file's intrinsic 1:1 size: declared physical units for
  SVG, embedded pixel density for raster formats, or the CSS standard 96 dpi
  conversion when a raster file has no physical density. A source whose native
  size cannot be determined is not assigned; Designer must never silently keep
  the arbitrary placeholder size. The operator may resize the artwork after
  this native-size import. A selected SVG Artwork exposes `Create Zones`, which
  imports every independent closed region as an editable Zone while preserving
  cubic handles, group transforms, the displayed `object-contain` placement and
  nested counters as compound holes. A compound lettering path therefore
  becomes separately selectable letter/stem/dot regions instead of one broad
  hit target. Open paths and non-vector elements are skipped and reported. The
  source Artwork and every layer/object visibility state remain completely
  unchanged; only the operator controls their eyes. The operator may then hide
  the reference or delete unwanted imported Zones. Upload lives in the folder
  (`Upload` action).
  Shortcut `i`.
- `Reference`: the build-area tools (rectangle, ellipse, polygon, bezier), the
  same tools used for reference geometry. Shortcuts `p` (polygon) and `b`
  (bezier).

Both object kinds are selectable, movable, resizable, insertable (double-click)
and deletable on the canvas while `Artwork` is active, and panel selection
mirrors on the canvas. Each object keeps its own visibility eye. Fixed folders
have persisted eye/lock masks beneath the category master switch; those masks
never overwrite their children's authored state. Opacity remains category-level.

The right Layers panel is the active-plane selector. Exactly one editing destination is active at a time, and it has a subtle blue rail/background rather than a second selected-object treatment. **On open no plane is active** (all categories collapsed): the canvas must not select, drag or draw any object until the operator activates a category. Category, fixed-folder and user-sublayer names activate their exact destination and return the pointer to Select; disclosure arrows only expand or collapse. Creating an object while a user sublayer is active assigns it there, while activating the fixed root creates at root. Visibility and lock buttons are secondary controls, not the active selection state. Canvas editing only applies to the active plane: `Artwork` is the umbrella plane for image placement **and** build-area/reference editing; `Diffusors` (internal `zones`) edits zones, channels and groups; `Strings` edits routes (data cables/LED strings); `Hardware` selects the controller. Selecting an object on the canvas opens Layers, expands its category and exact folder, scrolls its row into view and keeps that destination active. Tools must not switch the active plane. The toolbox shows only pointer-interaction tools that apply to the active plane, plus Select, Move, Pan and Measure. Move acts on the complete object, fixes the drag to the contextual X or Y axis and uses Ctrl/Command as a temporary two-axis override; it never converts a node or resize-handle hit into a geometry edit. Select freely drags an already selected complete object or compatible multi-selection while the first click remains selection-only and node, terminal and resize hits retain edit priority. The current selection wins hit testing when objects overlap. A pasted copy is inserted immediately above its source and inherits the same user sublayer. Commands such as Delete, Fit, Copy/Paste, Save and Compile never belong in the toolbox. See `.agent/DESIGNER_UX_CONTRACT.md`.

Every Layers category uses the same contextual grammar: scrollable properties
and visible contextual actions, then a fixed action group at the right edge. A
generic ellipsis/`More` menu or renamed catch-all operation menu must not hide
object capabilities. Copyable objects expose icon-only `Copy`, a stable
disabled/enabled `Paste`, and destructive `Delete`; unsupported capabilities
are omitted rather than invented. Zones, Channels and Face Graphic reuse the
same actions as Artwork. The buttons remain
available for an object selected in Layers even when its geometry is locked;
the lock still blocks canvas/property mutation and movement.

This placement is a durable cross-category pattern. Object/node values are
direct fields, single-object commands remain visibly named in the scrollable
context, pointer modes belong in the left rail, and only Copy/Paste/Delete form
the fixed trailing group. A named launcher may open one cohesive detailed
editor, but it must never disguise an overflow list of unrelated operations.
Horizontal pressure is handled by contextual scrolling and compact controls,
not by hiding capabilities. The normative decision table and change gate live
in `.agent/DESIGNER_UX_CONTRACT.md`; new object types inherit them.

`Build Areas` are editable reference geometries. They are not containers and do not own/delete zones or strings. Multiple build areas may exist. They currently support rectangle, ellipse and polygon. The overall canvas can be larger to leave room for controller, cables and notes. Artwork image references should be positioned/scaled into a build area, not forced to occupy the whole canvas.

Render order:

```text
Grid/rulers
-> Artwork image references
-> Reference / Build Area
-> Zones
-> Strings/controller/terminals
-> selection handles
```

Artwork source files live in the project Assets library (`iluminate.assets` + R2). Designer documents must never persist signed URLs or duplicate the binary asset. The browser resolves an artwork item through `/api/lighting/projects/[projectId]/assets/[assetId]`.

### Route Types

- `LED string`: amber/orange LED strip. It generates addressable pixel points and pixelMap data. Fabrication legs are derived between its nodes; they are not normal effect targets.
- `Data cable`: green signal cable. It is visual/planning geometry only and does not generate LEDs.
- While the Hardware/Strings plane is active, a single-face view adds only a
  theme-aware peripheral canvas cue: sky `TOP · FRONT` or violet
  `DOWN · REAR`. `Both` remains neutral. This overlay is pointer-transparent
  and does not participate in geometry, rendering or optical preview.

### Terminals And Direction

- Route green terminal: input/start/DIN.
- Route red terminal: output/end/DOUT.
- Route terminals use screen-constant high-contrast rings and remain visibly
  larger than internal fabrication nodes in both themes. DIN's outer ring is
  larger than DOUT's so both colors remain legible at a coincident closed-loop
  seam without moving either electrical coordinate.
- Controller port: red output terminal.
- Internal fabrication node/bend/cut point: violet. It is not a LED, terminal or solder joint.
- Route arrows show flow from green to red.
- Controller port arrows should be drawn inside the PCB, pointing toward the red port, so they do not look like extra connection points.

## Snap And Solder Rules

This is a hard UX rule:

```text
No tolerance-based soldering.
No hidden auto-moving terminals.
Only exact same grid snap point solders.
```

The canvas may use proximity only as an editing aid while dragging, with a
screen-constant 5 px capture radius centered on the terminal, so the moving
terminal lands exactly on the target snap point. Releasing outside that radius
must not trigger a second physical-distance capture. The compiler must never
infer electrical continuity from nearby points. Compilation reads only persisted
coordinates plus `joint: true`.

Clicking a terminal is selection only. Terminal movement and solder evaluation
start only after a deliberate screen-space drag of at least 3 px; ordinary
pointer jitter while selecting must not move or join terminals.

The configured drawing grid never enlarges electrical coincidence. It may place
a dragged terminal on a grid coordinate, but solder evaluation is authorized
only when the unsnapped pointer enters the 5 px terminal capture circle. Two
separated terminals inside the same grid cell remain electrically independent.

Route-to-route soldering:

- Green route terminal + red route terminal on the same snap point solders.
- Green-to-green and red-to-red never solder.
- Both terminals must belong to the same `Front` or `Rear` construction plane.
  Coincident coordinates across planes remain electrically independent, even
  when both planes are visible.
- It does not matter whether the route is `LED string` or `Data cable`.
- Same-kind routes merge into one route and the duplicate terminal disappears.
- Mixed `Data cable` + `LED string` remains two route types, but both terminal points are marked `joint: true`.
- Ctrl/Command/Shift selection may select multiple LED strings. With exactly
  two selected, `Connect strings` is enabled only when exactly one string
  already resolves to a controller output, both strings share a construction
  surface, and the upstream DOUT and downstream DIN are free. The action adds a
  normal editable orthogonal data-cable route and persists explicit solder
  joints at both ends. It does not perform obstacle avoidance.

Controller-to-cable soldering:

- Controller red output port + `Data cable` green/input terminal on the same snap point solders.
- Only data cables connect to controller ports.
- LED strings should not connect directly to controller ports.
- Connected controller ports render cyan.
- The cable adopts the controller output number.

Confirmed solder:

- A real solder joint is represented with `joint: true`.
- A confirmed joint renders cyan.
- Cyan must never remain on a floating terminal.

Deletion cleanup:

- Deleting a route must clear orphaned/floating `joint: true` markers on remaining terminals.
- The final remaining route is deletable. `routes: []` is valid persisted
  authored state, and deletion also removes that route id from every light
  source `stringIds` compatibility cache. Compile recalculates that cache.
- A terminal remains cyan only if another compatible terminal is on the same snap point, or if a data-cable green terminal is on a controller red port.

Drag behavior:

- Dragging a cyan solder joint moves all terminals in that joint together.
- Dragging a route with a soldered endpoint keeps connected route terminals attached.
- Dragging an unsoldered LED-string DIN or DOUT backward along that string's
  existing polyline shortens it and consumes every internal node crossed by the
  terminal. Leaving the existing path remains an ordinary free terminal move.
  This topology-changing retraction does not apply to data cables or soldered
  terminal groups.
- Dragging the controller moves data cables soldered to its ports with it.
- Dragging a data cable that is soldered to a controller port must keep the cable input terminal anchored to that port; the controller does not move.
- To avoid detach bugs during controller drag, use a snapshot of the original routes captured at drag start.

Detach behavior:

- Select a confirmed solder node and press the scissors in the Strings tool rail; it detaches immediately and must not appear in the contextual properties bar.
- Detaching preserves every cable/string and only removes the selected electrical joint.
- Controller/cable and mixed cable/string joints clear the selected terminal and any counterpart that becomes floating.
- Same-kind cable/cable and string/string solder is stored as one merged route; detaching its internal joint splits it back into two complete independent routes.
- The detached terminal returns to its normal green/red node color. With no soldered node selected, the same left-rail scissors retains its `Cut route` pointer mode for deliberate geometric route splitting.

## Current Tools

Left toolbox:

- Select: click uses the active-plane hit order; dragging from empty canvas
  creates an orthogonal marquee. It selects all touched visible profiles from
  one compatible category (preferring the active category, otherwise the
  largest touched set) so they can be grouped or used by profile operations.
  Diffusors includes both Zones and Channels in the marquee highlight; mixed
  selections do not expose profile-only Group or boolean operations. Move on
  any selected Zone or Channel drags the complete transient selection with the
  existing axis, modifier, snap and lock behavior. Images, routes, Work Lines
  and the controller retain click selection.
- Move: whole-object movement constrained to contextual X or Y; Ctrl/Command
  temporarily permits both axes.
- Select: dragging the already selected object moves it freely; object-edit
  handles retain priority and the initial selection click does not move it.
- Pan.
- Secondary/right-button drag always pans without changing the active tool or
  opening the browser context menu on the canvas.
- Measure.
- Rectangle zone.
- Ellipse zone.
- LED string: click-to-trace tool. First canvas click places the green DIN/start terminal, second click creates the first real segment and red DOUT/end terminal, each later click appends a bend/cut node and moves the red terminal to the new end. Enter finishes and deselects the current trace without leaving the tool, so the next click starts a new LED string; with only the provisional start point, Enter cancels that incomplete trace.
- Data cable: same click-to-trace and Enter-to-finish behavior as LED string, but green signal-only rendering and no LED generation.
- Cut route.

Delete is a contextual action and keyboard command. Fit is a global view
command. Zoom uses the mouse wheel/trackpad. None of them belongs in the tool
rail.

Reference tools:

- Rectangle Build Area.
- Ellipse Build Area.
- Polygon/Pen Build Area.

Zone tools:

- Rectangle Zone.
- Ellipse Zone.
- Polygon Zone, with the shared new-node picker for straight or Bezier nodes.

Reference also exposes Bezier Build Area as a dedicated creation preset.

Polygon/Pen behavior:

- Click adds points.
- Clicking the first snap point again closes the polygon.
- Escape cancels the draft.
- Selected polygons expose editable node handles.
- Clicking a polygon node selects the nearest node and shows `Point N` with `PX/PY` in the contextual toolbar. Hit tolerance stays screen-sized under zoom, and nodes on the already selected object win before overlapping objects.
- Dragging a selected node reshapes the polygon without moving the full object.
- Double-clicking close to a polygon edge inserts a new node on that edge; double-clicking on an existing node never inserts one.
- Delete/Backspace or the `Point` delete action removes the selected node, but polygons must keep at least 3 points.
- Moving/resizing a polygon moves/scales its nodes.

Bezier behavior:

- The Bezier tools create the same persisted `polygon` geometry as the Pen, with `pathMode: "bezier"`; they do not create a parallel shape model.
- Activating any geometric path tool immediately exposes the shared contextual
  `New node` picker for Build Area, Zone, Channel and Face Graphic. Its corner,
  straight, smooth or symmetric choice applies to each subsequent click, so a
  single path may mix node types without layer-specific creation state.
- Click anchors, then click the first anchor again to close. Initial handles are
  generated automatically from neighboring anchors only for smooth and
  symmetric nodes; corner and straight nodes remain handle-free.
- Select an anchor to show its two control handles. Drag either handle to reshape the curve; its opposing handle mirrors automatically, keeping the node smooth.
- Converting a node to smooth or symmetric switches its specific compound
  contour to Bezier mode and persists both handles; converting the final curved
  node back to corner/straight returns that contour to straight mode.
- Curve hit testing, selecting and double-click node insertion follow the rendered Bezier curve, rather than the straight anchor chords.
- Moving/resizing a Bezier path preserves and transforms its handle vectors.

There is no solder/cautin tool. Do not add it back.

Top command/context bars:

The mandatory placement rules live in `.agent/DESIGNER_UX_CONTRACT.md`.

- The first bar is global and selection-independent: Back/document identity,
  Design/Animate, grouped Setup, Ruler, Fit, Layers, compile state/issues,
  Theme, Undo/Redo, Compile and Save. Animate adds Preview, Outlines and Viewer
  as mode-wide controls.
- In Design, the second bar is contextual: functional controls required by the
  active tool when nothing is selected, or the selected object's properties
  and actions. It does not repeat tool names, usage instructions or the active
  layer; those cues belong to the left rail. Lighting, node controls,
  Copy/Paste and Delete belong here. Animate omits this row because calibration
  is in the right panel and timeline controls are below the canvas.
- A selected Face Graphic keeps its pass, translucent filter, selected-node
  controls and native-primitive dimensions in this row. Rectangles expose
  `W/H`; ellipses expose `ØW/ØH`. Locking remains exclusively in Layers; the
  row does not repeat object/category/lock labels or expose Shape, polygon
  dimensions or compound-contour summaries.
- A selected Zone likewise exposes `W/H` for a native rectangle and `ØW/ØH`
  for a native ellipse. It omits Shape and polygon dimensions; a selected
  node's relevant controls precede its geometry commands and trailing actions.
- Design has exactly two horizontal command/property bars; Animate has one. Do
  not add a third.
- `Add clip` uses the last empty timeline track. If none is empty, it appends a
  track first. It never inherits the selected clip's track or creates an
  automatic overlap.
- `Ctrl/Cmd+C` copies the selected Timeline clip and `Ctrl/Cmd+V` pastes that
  snapshot after the last clip in the same track. Every pasted clip receives a
  new internal ID while preserving the source target, effect, enabled state,
  blend and parameters. Repeated paste appends again; the scene duration
  expands when required so the copy is not truncated.
- Editing clips/tracks during playback temporarily suspends the frame loop and
  resumes after regeneration. Runtime reload preserves the requested playhead
  time and scrubbing remains accepted while that reload is pending. Playhead
  movement must not affect timeline measurements or scrollbar visibility. It
  renders as one pixel-aligned DOM element; horizontal scrolling is absent at
  zoom 1 and permanently reserved while zoomed.
- Compile derives and persists the physical pixelMap from controller ports,
  data cables, LED strings, zones and groups.
- Compile shows a real busy state from before layout derivation begins until
  the compiled document finishes saving; repeated Compile and Save actions are
  disabled during that interval.
- Animate is disabled until the current Designer signature has compiled with no electrical errors. Any change to controller, routes, addressable density, zones or groups makes the compilation stale. Artwork and reference-only changes do not.

Layer panel:

- Uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag/reorder.
- Main categories are `Artwork`, `Hardware`, `Diffusors`, `Face Graphic`, and
  `Fabrication Plans`. `Artwork` contains the fixed sublayers `Images` (placed image
  assets, with an upload action; each selected container configures its image
  from a source dropdown) and `Reference`
  (build areas); `Reference` is no longer a top-level category. `Diffusors` is
  the visual-target plane (internally the `zones` layer); it groups three
  fixed sublayers `Zones` (blue dot), `Channels` (orange Waves icon), and
  `Effect targets`. `Hardware` contains the fixed `Strings`, `Data cables`, and
  `Controller` sublayers. Face Graphic objects live directly at the category
  root unless the user assigns them to a custom sublayer. Fabrication Plans
  uses each physical part as a semantic sublayer. Do not add
  new top-level-category actions. Creation tools operate inside the currently
  active category/layer.
- On open, every category and fixed sublayer starts collapsed. The panel
  auto-expands a category and the matching fixed sublayer only when a selected
  object belongs to it. Every deeper disclosure level also starts collapsed:
  opening a category or sublayer never cascades into its descendants. Selection
  navigation may expand only the exact ancestry required to reveal the selected
  object.
- Visibility and lock are hierarchical (Inkscape/Corel style). A category header eye is the
  **master switch** for its whole plane: `Artwork` covers both `Images` and the
  `Reference` build areas, `Diffusors` covers `Zones`/`Channels`/`Effect targets`,
  and `Hardware` covers routes plus the controller. A hidden
  category hides all of its objects regardless of their own eye; when the
  category is visible, only objects whose own row eye is on are drawn and
  hit-tested. The Controller row displays this effective Hardware-plus-object
  state and revealing it also reveals its Hardware parent. Fixed sublayers have
  their own persisted eye and lock masks. These
  masks never rewrite individual child eyes or locks, so restoring a parent
  reveals the exact prior child state. `Effect targets` remains organizational
  and has no visibility eye because target groups have no canvas geometry.
- Category opacity is a compact header action beside eye and lock. Activating
  its Blend icon opens a small live slider; opacity never consumes a permanent
  row in the expanded tree. Empty fixed folders remain visually empty instead
  of inserting instructional or `No ...` placeholder rows.
- The tree is navigation, ordering and organization—not a property form.
  Selecting an Image exposes its source in the contextual bar; selecting a
  Fabrication Part exposes name, side, material and thickness there. Search
  opens the necessary ancestry temporarily and restores the previous expansion
  state when cleared. The panel width and compact/comfortable density are local
  UI preferences and never pollute the partitura JSON.
- Lock is consistent with the toolbox: a locked category grays out (disables)
  its toolbox tools. The `Artwork` category lock gates all of its tools (Images
  and Reference). A fixed or user sublayer lock prevents geometry mutation and
  reordering for its contents while preserving selection for inspection. A
  hidden layer does not disable tools; using a tool re-shows the layer.
- Compatible fixed sublayers expose `+` to create persistent user sublayers.
  Dragging an object, or an existing multi-selection, onto one assigns it there;
  dragging it onto the fixed parent header removes that assignment. The panel
  does not insert a synthetic `Base level` row among the objects. A user sublayer has rename,
  eye, lock, and delete controls. Deleting it never deletes its objects: they
  return to the fixed parent. Sublayers are authoring-only and cannot alter
  pixel mapping, route order, optical ownership, effects, or fabrication.
- Dragging shows a count-aware overlay, a distinct insertion marker, delayed
  hover expansion and an accessible completion announcement. Arrow Left/Right
  on a focused category or sublayer label collapses/expands it.
- Object rows should prioritize the complete object name. Keep inline row
  actions minimal: reorder grip, visibility eye, rename, and open details. The
  details action opens a modal/popup where large object metadata can live
  without crowding the layer tree.
- The order persisted in the existing arrays is the visual/editing order:
  `artwork`, `buildAreas`, `zones`, `channels`, and `routes`.
- The layer panel order is front-to-back. Items at the top of a category are
  visually in front and receive hit-testing first. Items at the bottom are in
  the background. Reordering a zone is the intended way to place broad shapes
  such as "Rotulo completo" behind smaller letter/logo zones.
- The controller is fixed in Hardware; only data cables and LED strings
  are sortable.
- `Effect targets` is a fixed Diffusors sublayer alongside `Zones` and
  `Channels`, using a distinct effects/grouping icon and the same header,
  indentation, expansion and direct-manipulation language as other sublayers.
  `+` creates an empty target,
  or includes the currently selected Zones; double-click renames it. Dragging a
  Zone or compatible multi-selection onto a target adds references without
  moving or duplicating the source geometry, so one Zone may belong to several
  targets. Expanding a target lists only its members; clicking a Zone locates it
  on the canvas and `X` removes only that membership. Existing nested target
  references remain visible and removable. Target rows have no eye, lock or
  drawing order because they have no geometry. The compiler still rejects
  cycles, unknown members and duplicates.
- The `Hardware` layer has fixed `Data cables` and `Strings` sublayers. These
  are not separate work planes and do
  not change the active layer. Reordering is allowed only within the same route
  kind; do not drag data cables into LED strings or vice versa.
- Layer ordering is an authoring/selection concern. It must not change the
  physical wiring graph, generated serial order or firmware protocol.

## Source Of Truth And Runtime Cache Rules

The canonical editable state is `iluminate.partituras.document_json`.

Derived state:

- `document_json.compiledLayout`: generated by `Compile`; never edited directly.
- `iluminate.partituras.generated_json`: generated firmware/device artifact; never edited directly.
- Animate/player results: temporary browser/runtime cache only; never source of truth.

Required behavior:

- `Save` persists the current `document_json` only. It must not silently compile.
- `Compile` regenerates `compiledLayout`, clears stale animation preview/generated artifacts, and saves the compiled document.
- Physical compilation runs once in a dedicated browser Worker. Save must not
  call the compiler again. The compiled result returned by that Worker is the
  exact document persisted by the Compile command.
- Compile validation retains the legacy `errors[]` and `warnings[]` strings for
  runtime compatibility and also emits structured `issues[]` with selectable
  route/zone/channel/controller targets. The Designer modal renders names rather
  than internal route IDs and uses those targets for locate/edit actions.
- `Compile` belongs to Design mode. Do not show it inside Animate.
- Animate/Preview must use the current `document_json` plus a fresh `compiledLayout`. It must not reuse an old generated partitura after Designer or clip edits.
- Designer physical edits invalidate `compiledLayout`, animation preview and generated firmware artifact.
- Scene/clip/effect edits do not invalidate the physical compile when the Designer signature is unchanged, but they do invalidate animation preview and generated firmware artifact.
- `generated_json` is for firmware download only. Designer must never reload or edit from `generated_json`.
- Partitura PATCH accepts gzip for large authoring documents and returns only
  save metadata. Persistent Generate reads the saved document by partitura ID;
  list endpoints expose summaries and never transfer every `document_json`.

## Animate Rendering Architecture

Animate rendering is intentionally separated from Designer authoring and from
timeline state.

```text
Designer document_json
-> Compile creates compiledLayout.pixelMap
-> Animate/effects create frame colors per pixel
-> Player surface handles viewport, pan/zoom and selection
-> Renderer module presents the installed lighting or the raw LED map
```

`player-surface.tsx` must remain a thin surface/container. Do not place
optical diffusion math, material presets or pixel drawing algorithms directly in
that component. Renderer implementations live under:

```text
services/web/iluminate/components/lighting/player/
```

Current renderer module:

- Animate uses one persistent WebGL2 surface and a dedicated evaluation Worker.
  Do not create a second canvas renderer or a second fullscreen player.
- The core runtime is prepared once, keeps flattened dense pixel membership and
  renders into a recycled typed array. Only one transferred frame may be in
  flight. React receives throttled status only.
- Timeline edits remain local while a clip is dragged. Animate regenerates the
  temporary runtime once on pointer release, or after a short debounce for
  inspector edits, and cancels superseded requests. Clip-only changes reload
  the evaluation Worker without rebuilding WebGL geometry, optical masks or
  outline buffers; those renderer resources change only with the physical or
  optical visual scene.
- `Webgl2PlayerRenderer` composes Front, Halo-Lit and directional Wall Washer
  mounts. A target may have more than one mount at the same time.
- `visual-scene.v1` carries resolved physical Channel contours. The WebGL2
  outline pass only flattens those canonical curves into GPU segments; it does
  not offset widths, infer caps or reinterpret corner radii.
- Optical treatments persist in `designer.opticalTreatments` and reference a
  zone or channel. They consume compiled pixel colors but do not change wiring,
  pixelMap membership, effect targeting or the firmware artifact.
- Front chooses the face material: visible `LED Pixels`, `Silicone Strip`,
  `Milky White` or `Day/Night`. Direct LED Pixels use intensity only. Every
  diffuser material uses the same explicit distance, beam and softness
  calibration to determine whether individual LEDs remain visible or blend
  into a continuous face; channel width is not an optical control. The legacy
  persisted transmission value remains document-compatible but is not exposed
  as a calibration control because the renderer does not consume it.
- A treatment can target the canvas, a Build Area or another zone as its light
  receiver. Halo-Lit supports an opaque face over the emitted field; Wall Washer
  supports direction, throw, beam angle, softness and falloff.
- `DiffuserRenderSettings` remains a temporary global preview calibration for
  intensity. Animate's transient Outlines checklist independently resolves the
  compiled Front/Rear variants of `Effect targets` into Zone and Channel GPU
  outline batches. That resolved set also prioritizes overlapping canvas hits
  and gates the thick selection outline; selecting a different object still
  updates Targets and calibration without adding geometry outside the enabled
  outline set. It never changes optical evaluation, document visibility or
  persisted construction. Animate exposes only `As built` (all persisted mounts)
  and `LED map` (raw addressable pixels); physical configuration belongs to the
  selected zone or channel in Designer.
- Animate exposes the same persisted mounts in a calibration-only side panel.
  It may tune the existing source's optical calibration while the frame plays,
  but it must not create/remove/enable modes, rename sources, assign strings,
  choose materials or change receivers. Those are construction decisions owned
  by Design. Front calibration includes intensity and applicable diffuser
  distance/beam/softness; Halo includes intensity/spread/softness/
  wall gap/face color; Wall Washer includes intensity/spread/softness/direction/
  throw/beam/falloff. If no source exists, Animate sends the operator to Design.
- Halo-Lit remains a physical sum of fields emitted by each mapped LED. Wall
  gap controls the projected cone radius, spread adds source expansion, and
  intensity changes energy without changing field size. At zero gap/spread the
  emitter field is intentionally minimal rather than derived from pixel pitch.

Diffuser rendering must behave like a light field, not a zone color wash. Each
active LED contributes local energy around its physical `pixelMap` position.
Those contributions accumulate and are clipped by the zone geometry. A single
LED near the bottom of a large zone must not illuminate the entire zone. Uniform
coverage should emerge only when enough LED contributions overlap because of
physical spacing, diffuser distance and material scatter.

Overlapping zones need special handling in diffuser mode. A large "full sign"
zone is useful as an effect target, but it must not visually double-paint light
over smaller letter/logo zones. The current renderer assigns each mapped pixel
to the smallest visible zone containing it for diffuser drawing. This keeps
global effects usable without producing a full-canvas blur when a broad target
overlaps detailed zones.

The offline render harness consumes the same `partitura.v2`, `visual-scene.v1`,
core evaluator and WebGL2 renderer as the browser. Future shader refinements
must preserve that parity and the immutable `player-bundle.v1` boundary.

## Current Limitations

- Reference image import is still pending. The product should support SVG plus raster image references such as JPG, PNG, BMP and WebP.
- Freehand trace is pending. AI trace is intentionally out of scope for now.
- The first electrical validation covers missing controller signal paths, disconnected LED strings, multiple output roots and serial branches. Missing controller roots, multiple roots and serial branches are blocking errors. Disconnected LED strings are summarized as warnings while the operator is still drafting. The UI must show concrete validation messages on demand instead of a permanent, canvas-blocking error panel.
- Cutting welded joints needs a future UX decision.
- LED density changes do not yet reset/recompute routing with a warning.
- Raw pixelMap should remain hidden from normal operators.
- There is no legacy Layout, Physical map or Effect Lab workflow. The Designer is the canonical physical authoring surface; generated maps are derived data.

## Canonical Effect Targeting

Read `.agent/EFFECT_TARGETING_MODEL.md` before changing targeting semantics.

- The wiring graph is the physical truth: controller ports, data cables, LED
  strings and solder joints establish output and serial order.
- `pixelMap` joins that serial truth to a pixel's physical `x/y` position.
- The operator applies effects to named **zones** and **groups**, never by
  manually creating logical LED segments in the normal workflow.
- A zone selects pixels by geometry; a group combines zones/groups without
  changing wiring or duplicating pixels.
- Effects declare whether they use `serial`, `local`, or `global` coordinates.
- A future exact string range is an advanced exception only.

## Future Electrical Emulator Direction

The current geometry is enough to build a connectivity graph:

```text
controller ports
-> data cables
-> solder joints
-> LED strings
-> generated LED indices/pixelMap
```

Future validation should report:

- controller output with no cable;
- data cable not connected to a controller;
- data cable not connected to any LED string;
- LED string without a valid upstream signal path;
- ambiguous branches;
- reversed route direction;
- duplicate/conflicting output assignment;
- floating cyan joints;
- total LEDs per output and estimated current/power warnings.

These should start as warnings, not editing blockers, unless the user explicitly asks for hard validation.

## Validation Commands

For UI/model changes:

```bash
git diff --check
docker compose up -d --build iluminate-web
```

Optional API check:

```bash
curl -s http://localhost:8420/api/lighting/partituras | jq -r '.records[] | "\(.id) \(.partituraKey) \(.name) \(.status) \(.canvasWidthCm)cm routes=\(.routes)"'
```

The list response is a summary. Do not assume a fixed local record or route
count; use the item endpoint when the complete document must be inspected.

## Agent Guidance

- Respect the user's preference for direct, clean behavior over patchy helper hacks.
- Do not introduce hidden tolerances for snap/solder.
- Do not re-add a solder tool.
- Do not confuse firmware pin/hardware configuration with the web abstraction.
- Keep the UI consistent with the existing grid/workspace patterns, but the full-screen canvas can follow graphics-editor conventions.
- Before changing defaults, remember persisted documents may hide the change. Verify DB/API state when screenshots do not match code.
