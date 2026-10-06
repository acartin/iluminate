# Iluminate Designer Handoff

**Last updated:** 2026-10-06
**Purpose:** detailed current implementation handoff. Use the context router in
`.agent/RULES.md` and read only the headings relevant to the task instead of
loading this complete file by default.

## Current State

The fabrication upgrade in `docs/upgrade.doc` has completed phases 0–10. Face
Graphic is now a native authoring layer, and geometric layers support
associative projections, compound paths, live offsets, live fillets and
deterministic text outlines. Animate now applies Face Graphic as a physical
filter over an isolated front-light buffer, and Design exports validated SVG
and DXF fabrication interchange at physical scale.

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
  - `designer-webgl-player.tsx`: Animate player surface; owns viewport, Pixi mounting and zone selection.
  - `rendering/designer-player-renderers.ts`: isolated Animate buffers, direct LED rendering and Face Graphic optical filtering.
  - `fabrication/designer-fabrication-export.ts`: canonical validation plus 1:1 SVG and metric DXF serialization.
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

Normalized documents now write `designerSchemaVersion: 2`, a canonical
`designer.geometries` collection and stable `geometryId` references from build
areas, zones and channels. Legacy documents with only inline shape fields are
migrated during normalization. For compatibility with the current Paper
renderer, semantic records still carry synchronized inline bounds/points; on
load canonical geometry is authoritative, and every workspace mutation commits
the compatibility view back through `canonicalizeDesignerGeometry`.

Do not bypass that mutation boundary or introduce a second geometry model.
Face Graphic references this same canonical geometry collection.

### Face Graphic authoring

`designer.faceGraphics` contains native front-face mask/vinyl objects. Each
object references canonical geometry and owns only `passMode` (`opaque`,
`clear`, `translucent`) plus `filterColor`; it has no LED, diffusion or effect
properties. The Layers panel exposes `Face Graphic` as its own category and the
left rail reuses rectangle, ellipse, polygon and Bezier authoring. Magenta
shapes in Design are a fabrication preview, not the final optical calculation.

Face Graphic is deliberately omitted from `designerCompileSignature`, compiled
zones, pixelMap, groups and wiring. Editing it must not make a valid electrical
Compile stale. In `As built`, the renderer separates rear/external light from
front light, generates a viewport-aligned RGB transmission texture from the
vector Face Graphic, and filters only the front buffer. Outside the defined
graphic is opaque; the topmost persisted object wins overlaps. Compound holes
remain openings according to their enclosing region. Object/layer visibility
and opacity are editor aids and never become optical transmission controls.
Direct-mounted Front pixels participate in this pass. `LED map` bypasses it and
continues to show raw mapped output. Never replace this with a top-level
multiply overlay: it would incorrectly affect Halo, Wall Wash and the workspace
background.

### Associative Project Geometry

`designer.projections` stores linked, read-only references to canonical source
geometry. A projection has its own stable ID and presentation geometry ID, a
`sourceGeometryId`, and a `targetLayer` (`reference`, `zones` or
`faceGraphic`). Resolve it through `resolveDesignerProjectionGeometry`; never
copy source coordinates into a second authoritative record.

The contextual `Project Geometry` command is available when a geometric object
is selected. Projected objects render cyan/dashed in their target layer and are
selectable but not directly editable. Source edits update them immediately.
`Break Link` materializes the resolved profile as a native build area, zone or
Face Graphic object. Missing sources remain persisted as recoverable broken
references and can be relinked from the contextual source selector. Direct and
chained cycles are invalid and must be rejected with
`wouldCreateDesignerProjectionCycle`.

### Fabrication export

The Design global bar exposes `Export`. Its modal selects Reference/substrate,
Diffusors and Face Graphic output categories, DXF curve tolerance and minimum-
feature guidance. Both download actions run the same validation pass; errors
block the file while warnings remain downloadable.

SVG is millimeter-based, path-only, preserves native Beziers and compound
contours, and groups output by Designer category plus Face Graphic pass/color.
DXF uses `$INSUNITS=4`, named operation/material layers and deterministic closed
`LWPOLYLINE` flattening. Controlled editable text is outlined in memory and is
not changed in the document. Live derived profiles are exported; linked
projections, images, controller, routes, LEDs, selection visuals and other
editor guides are excluded. Broken projections warn because they are
construction-only; broken derived operations and unresolved fonts block.

Every file carries partitura/project identity, generation time and a SHA-256
source checksum. Export does not require or change electrical Compile and does
not create firmware/toolpaths. PDF, EPS, STL and proprietary cutter formats
remain outside the implemented contract.

Projections are construction references: keep them out of electrical Compile,
pixelMap and fabrication export unless the operator explicitly materializes or
derives geometry from them.

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
a same-layer operand list with Shift/Ctrl/Command-click. Subtract uses selection
order: first profile minus subsequent profiles. Native operands are consumed;
linked projections used as operands remain intact. One Undo reverses the whole
operation.

Boolean results can be moved and resized as complete profiles. Phase 5 does not
expose direct per-contour node editing. Self-intersections, duplicate contours,
open profiles and empty results are rejected. Zone contour changes invalidate
Compile because they change pixel membership; Reference and Face Graphic
booleans remain electrically neutral.

### Derived offset and fillet geometry

`designer.derivedGeometries` persists non-destructive `offset` and `fillet`
operations. Each record points to canonical geometry, a projection or an
earlier derived result through `sourceGeometryId`, keeps its target layer, and
stores only operation parameters. Resolve it through
`resolveDesignerGeometryReference` / `resolveDesignerDerivedGeometry`; do not
snapshot source coordinates into the operation record.

The shared calculation is in
`lib/lighting/designer-derived-geometry.ts`. Offsets use signed millimeter
distances and `round`, `miter` or `bevel` joins; miter joins also persist a
limit. Fillets persist a millimeter radius and an optional flattened
corner-index selection. Both operations preserve compound contours and
open/closed topology. Fillet radii clamp to short legs with an explicit
warning. Collapsed inward offsets, invalid topology, broken sources and cycles
stay persisted and selectable so the operator can repair the parameters or
source.

Derived chains are live and acyclic. A source edit must immediately recalculate
projection → offset → fillet descendants. Use
`wouldCreateDesignerDerivedGeometryCycle` before relinking. Derived profiles
are amber and read-only on canvas; `Break Link` materializes the current result
as a native object. They remain outside the electrical Compile signature and
pixelMap until materialized.

When a derived profile targets Face Graphic it also owns only `passMode` and
`filterColor`, with translucent white defaults. Those values follow chained
operations, survive normalization, drive the As built frontal-light filter and
select the SVG/DXF material group. Editor visibility remains non-physical.
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
Text can live in Reference, Diffusors or Face Graphic and uses the same Text
tool behavior in every geometric layer.

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

New/default documents should start with:

- Controller card near upper-left: `x=4`, `y=4`.
- A clear left strip for controller/cable work.
- Default sign zones/routes shifted to the right, starting around `x=42`.
- Canvas width `170 cm`, height `40 cm`.
- Addressable density `60 Pixels/m`.
- Physical emitter density `60 LEDs/m`.
- Derived physical ratio defaults to `1 LED/px`.
- Snap `2 cm`.
- Three controller outputs by default.

Do not put default zones/routes underneath the controller. If a screenshot shows the PCB overlapping Fondo or a route, the document is likely old/persisted or the defaults regressed.

## Visual Vocabulary

### Addressable Pixels vs Physical LEDs

Do not assume one addressable pixel is always one physical LED.

- `Pixels/m` means addressable WS281x pixels per meter. This is the density used to sample LED routes, output counts, serial indices, pixelMap rows and firmware frames.
- `LEDs/m` means physical light emitters per meter. This is used by the Designer/simulator to preview how a real 5V, 12V or 24V strip may look.
- `LEDs/px` is derived from `LEDs/m / Pixels/m`. Examples: WS2812B 5V is normally `1 LED/px`; many WS2811 12V strips are around `3 LEDs/px`; some 24V strips may be around `6 LEDs/px`.
- The firmware still emits WS281x frames by addressable pixel. Electrical implementation beyond the data output is not part of the partitura contract.

### Canvas Layers

The Designer separates five persisted visual layers:

- `Artwork`: imported client/project image assets placed on the canvas. It renders image references only, does not duplicate/upload assets, and does not generate LEDs. Each item persists `assetId`, name and rectangle. Older JSON may still contain item-level visibility/lock/opacity fields, but the UI/rendering policy is to control visibility, lock and opacity at the layer/category level only.
- `Reference`: measured construction/reference geometry such as build areas. It does not generate LEDs. In the panel it is presented as a `Reference` folder inside the `Artwork` category. The folder has no header eye/lock/opacity; the `Artwork` category eye/lock governs the reference plane as its master, and each build area's own eye refines it. Rendered as a violet dashed guide.
- `Zones`: visual targets such as letters, logos, background and full sign.
- `Channels`: neon-flex bands belonging to the Zones plane. A channel reuses the
  Bezier trajectory as an editable center line and derives two parallel borders
  from a width. It behaves as a zone for pixel mapping and effects.
- `Hardware`: the Layers category groups the physical construction rows into
  `Strings`, `Data cables` and `Controller` folders. The controller is drawn as
  a small PCB (board, two cosmetic chips and a status dot); the chips are
  visual only and do not change behavior.
- `Strings`: persisted physical fabrication plane containing LED strings, data
  cables, terminals and joints (no controller). It remains distinct from the
  persisted controller layer even though both appear under the `Hardware`
  category in Layers.

`Light Sources` is deliberately absent from Layers. The persisted
`designer.lightSources` collection currently stores what the product calls
Lighting Setups: Front, Halo-Lit or Wall Washer configuration owned by a zone
or channel and referencing physical LED strings. These records have no
independent canvas geometry or drawing tool, so they are not an activatable
canvas plane. Do not restore that category. Keep the legacy persisted name only
for backward compatibility until an explicit model migration is designed.

Each Zone and Channel row has a visible lightbulb action that selects the owner
and opens its Lighting Setup modal. The contextual bar does not repeat that
modal button; it shows read-only mounting/material status icons. Only enabled
setups with at least one assigned LED string count as configured. Enabled
records without strings show an incomplete warning instead of pretending that
Front/Halo/Wall Washer is installed. Zone/channel rows omit their geometry
description because shape, dimensions and path properties already live in the
contextual bar.

Each layer has `visible`, `locked` and `opacity`. Hidden layers do not render or receive selection. Locked layers remain visible and selectable for inspection, but cannot be moved, resized, deleted or edited from the canvas/toolbox/contextual properties. A locked selection is identified as `Locked · inspect only`. Each object row also exposes a per-object visibility eye (like the layer header): hidden objects do not render and are not hit-tested. Per-object lock and opacity remain layer-level only.

`Groups` are not a canvas layer and have no geometry. They are authored in the `Zones Groups` folder of the `Diffusors` category: a named, cycle-free composition of zones and/or other groups. A clip that targets a group applies its effect to the union of the member zones' pixels, respecting each zone's geometry, and behaves as one composition across the group's bounds. Whole-sign composition is achieved by grouping the desired zones (a group of all zones spans the sign). The clip `coordinateSpace` control was removed from the UI; clips are authored as `"local"` and the core still accepts/validates `serial`/`local`/`global`. Groups persist in `designer.groups` and compile into `compiledLayout.groups`.

### Channel Tool

`Channel` is a Zones-plane tool for neon-flex routing. The operator traces the
center line exactly like the Bezier zone tool, then finishes with a double-click
or `Enter` (open ends) or by clicking the first node (closed loop). The operator
only edits the center nodes and Bezier handles; the two parallel borders are
derived and are never manipulated separately.

- Persisted form is `designer.channels` with the center `points`, `pathMode`,
  `widthMm` (3-20 mm), explicit `closed` topology and endpoint `cap`
  (`butt` / `round`). Legacy documents that encoded closure as `cap: "closed"`
  are normalized to `closed: true` plus `cap: "butt"`. The generated band is
  never stored, only the center trajectory, topology and width.
- `channelBorderPolylines` derives independent left/right borders for a closed
  band; `openChannelOutline` derives the capped polygon for an open band;
  `channelContainsPoint` selects pixels by distance to the center line.
- Removing the last Bezier handle must never change channel topology. Paper,
  Pixi and Canvas renderers must all respect the same explicit `closed` flag.
- On compile, channels are emitted as zones in `compiledLayout.zones` (and join
  the `full_sign` group), so clips target them like any zone. They appear in the
  Animate and Scenes target lists, and are selectable on the Animate canvas
  (clicking a channel selects it, so `Add clip` targets it).
- Timeline selection is bidirectional: clicking a clip keeps it selected and
  selects/highlights its owning zone or channel on the Animate canvas. Because
  current clips target a Front/Halo-Lit/Wall Washer source ID, resolve the
  source `targetType`/`targetId`; never select the non-geometric source record
  as a substitute for its owner. Direct legacy zone/channel clip targets remain
  supported, and changing the clip Target performs the same synchronization.
- The Layers panel `Channels` section selects, renames, deletes and edits width
  and ends of each channel. Width and ends also appear in the top contextual bar
  when a channel is selected.
- Corner fillet: a corner/straight node can carry a parametric `radiusMm`
  (`DesignerPoint.radiusMm`). The center line inserts a tangent circular arc
  (clamped by the neighboring segment lengths) and the two borders follow it, so
  the tape gets a real, editable bend radius. The selected node exposes a
  `Fillet` field in the contextual bar. Fillet applies to straight/corner nodes
  without Bezier handles (i.e. polygonal paths); a node with handles is treated
  as a free curve. Compile warns when a fillet radius is smaller than half the
  channel width, because the inner border would pinch.

### Artwork Tool

`Artwork` is the umbrella plane for visual references. Activating the category
(or either of its `Images` / `Reference` folders) exposes two toolbar groups:

- `Images`: the `Image` tool (`image_place`). Arm it, then click the canvas to
  place an **empty image container** at that point; the container is selected.
  Choose its image afterwards from the `Image source` dropdown in the `Images`
  folder (populated from the project assets). Asset-less containers render as a
  dashed placeholder on the canvas. Upload lives in the folder (`Upload`
  action). Shortcut `i`.
- `Reference`: the build-area tools (rectangle, ellipse, polygon, bezier), the
  same tools used for reference geometry. Shortcuts `p` (polygon) and `b`
  (bezier).

Both object kinds are selectable, movable, resizable, insertable (double-click)
and deletable on the canvas while `Artwork` is active, and panel selection
mirrors on the canvas. Each object keeps its own visibility eye. Folders have no
per-folder eye/lock/opacity: the `Artwork` category header owns the plane
visibility/lock, and the `Reference` folder is standardized to per-object eyes
only.

The right Layers panel is the active-plane selector. Exactly one layer is active at a time, and the active layer must have a clearly different background. **On open no plane is active** (all categories collapsed): the canvas must not select, drag or draw any object until the operator activates a category. Clicking a category label, disclosure arrow or folder activates it immediately and returns the pointer to Select; zoom/pan must never be needed to complete activation. Visibility and lock buttons are secondary controls, not the active selection state. Canvas editing only applies to the active plane: `Artwork` is the umbrella plane for image placement **and** build-area/reference editing; `Diffusors` (internal `zones`) edits zones, channels and groups; `Strings` edits routes (data cables/LED strings); `Hardware` selects the controller. Selecting an object on the canvas opens Layers, expands its category and exact folder, scrolls its row into view and keeps that layer active. Tools must not switch the active plane. The toolbox shows only pointer-interaction tools that apply to the active plane, plus Select, Pan and Measure. Commands such as Delete, Fit, Copy/Paste, Save and Compile never belong in the toolbox. See `.agent/DESIGNER_UX_CONTRACT.md`.

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

### Terminals And Direction

- Route green terminal: input/start/DIN.
- Route red terminal: output/end/DOUT.
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

The canvas may use proximity only as an editing aid while dragging, so the
moving terminal lands exactly on the target snap point. The compiler must never
infer electrical continuity from nearby points. Compilation reads only persisted
coordinates plus `joint: true`.

Route-to-route soldering:

- Green route terminal + red route terminal on the same snap point solders.
- It does not matter whether the route is `LED string` or `Data cable`.
- Same-kind routes merge into one route and the duplicate terminal disappears.
- Mixed `Data cable` + `LED string` remains two route types, but both terminal points are marked `joint: true`.

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
- A terminal remains cyan only if another compatible terminal is on the same snap point, or if a data-cable green terminal is on a controller red port.

Drag behavior:

- Dragging a cyan solder joint moves all terminals in that joint together.
- Dragging a route with a soldered endpoint keeps connected route terminals attached.
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

- Select.
- Pan.
- Measure.
- Rectangle zone.
- Ellipse zone.
- LED string: click-to-trace tool. First canvas click places the green DIN/start terminal, second click creates the first real segment and red DOUT/end terminal, each later click appends a bend/cut node and moves the red terminal to the new end.
- Data cable: same click-to-trace behavior as LED string, but green signal-only rendering and no LED generation.
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
- Polygon/Pen Zone.
- Bezier Build Area / Bezier Zone.

Polygon/Pen behavior:

- Click adds points.
- Clicking the first snap point again closes the polygon.
- Escape cancels the draft.
- Selected polygons expose editable node handles.
- Clicking a polygon node selects that node and shows `Point N` with `PX/PY` in the contextual toolbar.
- Dragging a selected node reshapes the polygon without moving the full object.
- Double-clicking a polygon edge inserts a new node on that edge.
- Delete/Backspace or the `Point` delete action removes the selected node, but polygons must keep at least 3 points.
- Moving/resizing a polygon moves/scales its nodes.

Bezier behavior:

- The Bezier tools create the same persisted `polygon` geometry as the Pen, with `pathMode: "bezier"`; they do not create a parallel shape model.
- Click anchors, then click the first anchor again to close. Initial smooth handles are generated automatically from neighboring anchors.
- Select an anchor to show its two control handles. Drag either handle to reshape the curve; its opposing handle mirrors automatically, keeping the node smooth.
- Curve hit testing, selecting and double-click node insertion follow the rendered Bezier curve, rather than the straight anchor chords.
- Moving/resizing a Bezier path preserves and transforms its handle vectors.

There is no solder/cautin tool. Do not add it back.

Top command/context bars:

The mandatory placement rules live in `.agent/DESIGNER_UX_CONTRACT.md`.

- The first bar is global and selection-independent: Back/document identity,
  Design/Animate, grouped Setup, Ruler, Fit, Layers, compile state/issues,
  Theme, Undo/Redo, Compile and Save. Animate adds Preview, Outlines and Viewer
  as mode-wide controls.
- In Design, the second bar is contextual: active-tool guidance when nothing is
  selected, or the selected object's properties and actions. Lighting, node
  controls, Copy/Paste and Delete belong here. Animate omits this row because
  calibration is in the right panel and timeline controls are below the canvas.
- Design has exactly two horizontal command/property bars; Animate has one. Do
  not add a third.
- `Add clip` uses the last empty timeline track. If none is empty, it appends a
  track first. It never inherits the selected clip's track or creates an
  automatic overlap.
- Editing clips/tracks during playback temporarily suspends the frame loop and
  resumes after regeneration. Playhead movement must not affect timeline
  measurements or scrollbar visibility. It renders as one pixel-aligned DOM
  element; horizontal scrolling is absent at zoom 1 and permanently reserved
  while zoomed.
- Compile derives and persists the physical pixelMap from controller ports,
  data cables, LED strings, zones and groups.
- Animate is disabled until the current Designer signature has compiled with no electrical errors. Any change to controller, routes, addressable density, zones or groups makes the compilation stale. Artwork and reference-only changes do not.

Layer panel:

- Uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag/reorder.
- Main categories, in order, are `Artwork`, `Diffusors`, `Strings`, and
  `Hardware`. `Artwork` contains the collapsible folders `Images` (placed image
  assets, with an upload action; each selected container configures its image
  from a source dropdown) and `Reference`
  (build areas); `Reference` is no longer a top-level category. `Diffusors` is
  the visual-target plane (internally the `zones` layer); it groups three
  collapsible folders, `Zones` (blue dot), `Channels` (orange Waves icon) and
  `Zones Groups`. `Hardware` holds the controller and is last. Do not add "new
  category" actions there. Creation tools operate inside the currently active
  category/layer.
- On open, every category (`Artwork`, `Diffusors`, `Strings`, `Hardware`) and
  every subfolder (`Artwork`'s `Images`/`Reference`, `Diffusors`' `Zones`/
  `Channels`/`Zones Groups`) start collapsed. The panel auto-expands a category
  (and the matching subfolder) only when a selected object belongs to it.
- Visibility is hierarchical (Inkscape/Corel style). A category header eye is the
  **master switch** for its whole plane: `Artwork` covers both `Images` and the
  `Reference` build areas, `Diffusors` covers `Zones`/`Channels`/`Zones Groups`,
  `Strings` covers routes, and `Hardware` covers the controller. A hidden
  category hides all of its objects regardless of their own eye; when the
  category is visible, only objects whose own row eye is on are drawn and
  hit-tested. Lock and opacity stay category-level. Folders have no eye of their
  own.
- Lock is consistent with the toolbox: a locked category grays out (disables)
  its toolbox tools. The `Artwork` category lock gates all of its tools (Images
  and Reference). Folders have no lock of their own. A hidden layer does not
  disable tools; using a tool re-shows the layer.
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
- The controller is fixed in the Strings layer; only data cables and LED strings
  are sortable.
- `Zones Groups` is a collapsible folder inside `Diffusors`, alongside `Zones` and
  `Channels`. It is not a work plane: creating groups never changes the active
  layer. A new group starts with every current zone as a member; its expanded
  list shows all available zones/channels as checkboxes (checked = member),
  so membership is a simple checklist. Checking a zone, or clicking its name,
  selects that zone on the canvas (and activates the Diffusors plane) so it can
  be located. The list also offers nested groups; options that would create a
  cycle are disabled, and the compiler also rejects cycles, unknown members and
  duplicate members.
- The `Strings` layer may show visual subfolders such as `Data cables` and
  `LED strings` for clarity. These folders are not separate work planes and do
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
- `Compile` belongs to Design mode. Do not show it inside Animate.
- Animate/Preview must use the current `document_json` plus a fresh `compiledLayout`. It must not reuse an old generated partitura after Designer or clip edits.
- Designer physical edits invalidate `compiledLayout`, animation preview and generated firmware artifact.
- Scene/clip/effect edits do not invalidate the physical compile when the Designer signature is unchanged, but they do invalidate animation preview and generated firmware artifact.
- `generated_json` is for firmware download only. Designer must never reload or edit from `generated_json`.

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

`designer-webgl-player.tsx` must remain a thin surface/container. Do not place
optical diffusion math, material presets or pixel drawing algorithms directly in
that component. Renderer implementations live under:

```text
services/web/iluminate/components/lighting/designer/rendering/
```

Current renderer module:

- Animate uses one Pixi/WebGL surface. The previous Canvas 2D diffuser surface
  was removed; do not create a second canvas renderer for optical presentation.
- `renderPixiAnimationFrame` composes Front, Halo-Lit and directional Wall
  Washer mounts. A target may have more than one mount at the same time.
- Optical treatments persist in `designer.opticalTreatments` and reference a
  zone or channel. They consume compiled pixel colors but do not change wiring,
  pixelMap membership, effect targeting or the firmware artifact.
- Front chooses the face material: visible `LED Pixels`, `Silicone Strip`,
  `Milky White` or `Day/Night`. Its distance controls whether individual LEDs
  remain visible or blend into a continuous face. Silicone Strip additionally
  persists physical light transmission and beam angle; channel width is not an
  optical control.
- A treatment can target the canvas, a Build Area or another zone as its light
  receiver. Halo-Lit supports an opaque face over the emitted field; Wall Washer
  supports direction, throw, beam angle, softness and falloff.
- `DiffuserRenderSettings` remains a temporary global preview calibration for
  intensity and outlines. Animate exposes only `As built` (all persisted mounts)
  and `LED map` (raw addressable pixels); physical configuration belongs to the
  selected zone or channel in Designer.
- Animate exposes the same persisted mounts in a calibration-only side panel.
  It may tune the existing source's optical calibration while the frame plays,
  but it must not create/remove/enable modes, rename sources, assign strings,
  choose materials or change receivers. Those are construction decisions owned
  by Design. Front calibration includes intensity and applicable diffuser
  distance/softness/transmission/beam; Halo includes intensity/spread/softness/
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

Future shader or render-texture refinements must consume the same
`compiledLayout`, frame colors, viewport and optical-treatment contract.

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
curl -s http://localhost:8420/api/lighting/partituras | jq -r '.records[] | "\(.id) \(.partituraKey) \(.name) \(.status) \(.document.designer.canvasWidthCm)cm routes=\(.document.designer.routes|length)"'
```

Expected local active record after reset:

```text
1 default_installation Default Installation draft 170cm routes=4
```

## Agent Guidance

- Respect the user's preference for direct, clean behavior over patchy helper hacks.
- Do not introduce hidden tolerances for snap/solder.
- Do not re-add a solder tool.
- Do not confuse firmware pin/hardware configuration with the web abstraction.
- Keep the UI consistent with the existing grid/workspace patterns, but the full-screen canvas can follow graphics-editor conventions.
- Before changing defaults, remember persisted documents may hide the change. Verify DB/API state when screenshots do not match code.
