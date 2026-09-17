# Iluminate Designer Handoff

**Last updated:** 2026-09-10
**Purpose:** concise handoff for another AI/developer to continue the visual Designer without re-litigating current decisions.

## Current State

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
  - `designer-geometry.ts`: snap, bounds, hit testing, route sampling, solder/wiring helpers and ruler math.
  - `designer-compiler.ts`: compiles visual routes into the physical pixelMap and resolves visual targets from zones/groups.
  - `designer-ui.tsx`: toolbox buttons, contextual fields, layers panel and rulers.
  - `designer-webgl-player.tsx`: Animate player surface; owns viewport, Pixi mounting and zone selection.
  - `rendering/designer-player-renderers.ts`: isolated Animate renderers for direct LED pixels and acrylic diffuser preview.
- Grid wrapper: `services/web/iluminate/components/lighting/partitura-designer-workbench.tsx`
- Model/defaults/normalization: `services/web/iluminate/lib/lighting/partitura-model.ts`
- Server persistence: `services/web/iluminate/lib/server/partituras.ts`
- Menu config: `services/web/iluminate/lib/api.ts`
- Sidebar icon/style: `services/web/iluminate/components/portal/sidebar.tsx`

## Graphics Engine Decision

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
- `Hardware`: physical controller. Its `Hardware` category holds the controller
  row directly (no folders yet) and owns the layer show/lock/opacity. The
  controller is drawn as a small PCB (board, two cosmetic chips and a status
  dot); the chips are visual only and do not change behavior.
- `Strings`: physical fabrication plane containing LED strings, data cables, terminals and joints (no controller).

Each layer has `visible`, `locked` and `opacity`. Hidden layers do not render or receive selection. Locked layers remain visible but cannot be edited from the canvas/toolbox/top properties. Each object row also exposes a per-object visibility eye (like the layer header): hidden objects do not render and are not hit-tested. Per-object lock and opacity remain layer-level only.

`Groups` are not a canvas layer and have no geometry. They are authored in the `Zones Groups` folder of the `Diffusors` category: a named, cycle-free composition of zones and/or other groups. A clip that targets a group applies its effect to the union of the member zones' pixels, respecting each zone's geometry, and behaves as one composition across the group's bounds. Whole-sign composition is achieved by grouping the desired zones (a group of all zones spans the sign). The clip `coordinateSpace` control was removed from the UI; clips are authored as `"local"` and the core still accepts/validates `serial`/`local`/`global`. Groups persist in `designer.groups` and compile into `compiledLayout.groups`.

### Channel Tool

`Channel` is a Zones-plane tool for neon-flex routing. The operator traces the
center line exactly like the Bezier zone tool, then finishes with a double-click
or `Enter` (open ends) or by clicking the first node (closed loop). The operator
only edits the center nodes and Bezier handles; the two parallel borders are
derived and are never manipulated separately.

- Persisted form is `designer.channels` with the center `points`, `pathMode`,
  `widthMm` (3-20 mm) and `cap` (`butt` / `round` / `closed`). The generated
  polygon is never stored, only the center trajectory and the width.
- `channelOutline` derives the band (parallel borders + caps) for rendering;
  `channelContainsPoint` selects pixels by distance to the center line.
- On compile, channels are emitted as zones in `compiledLayout.zones` (and join
  the `full_sign` group), so clips target them like any zone. They appear in the
  Animate and Scenes target lists, and are selectable on the Animate canvas
  (clicking a channel selects it, so `Add clip` targets it).
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

The right Layers panel is the active-plane selector. Exactly one layer is active at a time, and the active layer must have a clearly different background. **On open no plane is active** (all categories collapsed): the canvas must not select, drag or draw any object until the operator activates a category, at which point that plane becomes editable. Visibility and lock buttons are secondary controls, not the active selection state. Canvas editing only applies to the active plane: `Artwork` is the umbrella plane for image placement **and** build-area/reference editing; `Diffusors` (internal `zones`) edits zones, channels and groups; `Strings` edits routes (data cables/LED strings); `Hardware` selects the controller. Tools must not switch the active plane. The toolbox should show only the tools that apply to the active plane, plus global navigation/actions such as select, pan, zoom and delete.

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

## Current Tools

Left toolbox:

- Select.
- Rectangle zone.
- Ellipse zone.
- LED string: click-to-trace tool. First canvas click places the green DIN/start terminal, second click creates the first real segment and red DOUT/end terminal, each later click appends a bend/cut node and moves the red terminal to the new end.
- Data cable: same click-to-trace behavior as LED string, but green signal-only rendering and no LED generation.
- Cut route.
- Delete selected.
- Pan.
- Zoom in/out/fit.

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

- Back.
- Copy/paste/delete also exist in the top command area, but delete in the toolbox is more intuitive for canvas editing.
- Save.
- Compile: derives and persists the physical pixelMap from controller ports, data cables, LED strings, zones and groups.
- Animate is disabled until the current Designer signature has compiled with no electrical errors. Any change to controller, routes, addressable density, zones or groups makes the compilation stale. Artwork and reference-only changes do not.
- Canvas settings: ruler unit, ruler visibility, width, height, LED density, snap.
- Selected object properties appear in the contextual bar.

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
-> Renderer module draws direct LED pixels or diffuser simulation
```

`designer-webgl-player.tsx` must remain a thin surface/container. Do not place
optical diffusion math, material presets or pixel drawing algorithms directly in
that component. Renderer implementations live under:

```text
services/web/iluminate/components/lighting/designer/rendering/
```

Current renderer module:

- `renderDirectLedFrame`: Pixi/WebGL direct pixel renderer.
- `renderDiffuserFrame`: canvas-based acrylic diffuser renderer.
- `DiffuserRenderSettings`: temporary calibration controls for distance,
  intensity, after-zone glow and an `Outlines` toggle. Intensity is intentionally
  rendered with extra gain so the maximum slider value reaches a visibly
  saturated acrylic simulation. After-zone glow is measured in real centimeters
  and is allowed to spill softly outside the zone only when the user raises that
  control. The after-zone halo is built from both zone and channel emitters, so
  channels glow outside their band exactly like zones. `showOutlines` (default true) controls whether zone/channel outlines,
  fills and labels are drawn; turn it off for a clean emulation with only the
  light output.

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

Future renderer experiments may replace the canvas diffuser renderer with a
Pixi/WebGL shader or render-texture implementation, but they must consume the
same `compiledLayout`, frame colors, viewport and diffuser settings contract.

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
