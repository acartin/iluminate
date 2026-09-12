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

- `Pixels/m` means addressable WS281x pixels per meter. This is the density used to compile segments, chain counts, pixel indices and firmware frames.
- `LEDs/m` means physical light emitters per meter. This is used by the Designer/simulator to preview how a real 5V, 12V or 24V strip may look.
- `LEDs/px` is derived from `LEDs/m / Pixels/m`. Examples: WS2812B 5V is normally `1 LED/px`; many WS2811 12V strips are around `3 LEDs/px`; some 24V strips may be around `6 LEDs/px`.
- The firmware still emits WS281x frames by addressable pixel. Electrical implementation beyond the data output is not part of the partitura contract.

### Canvas Layers

The Designer separates four persisted visual layers:

- `Artwork`: imported client/project image assets placed on the canvas. It renders image references only, does not duplicate/upload assets, and does not generate LEDs. Each item persists `assetId`, name, rectangle, visibility, lock and opacity.
- `Reference`: measured construction/reference geometry such as build areas. It does not generate LEDs.
- `Zones`: visual targets such as letters, logos, background and full sign.
- `Strings`: physical fabrication plane containing LED strings, data cables, terminals, joints and the controller.

Each layer has `visible`, `locked` and `opacity`. Hidden layers do not render or receive selection. Locked layers remain visible but cannot be edited from the canvas/toolbox/top properties.

The right Layers panel is the active-plane selector. Exactly one layer is active at a time, and the active layer must have a clearly different background. Visibility and lock buttons are secondary controls, not the active selection state. Canvas editing only applies to the active layer: artwork image placement edits only when `Artwork` is active; build area/reference edits only when `Reference` is active; zones edit only when `Zones` is active; routes/controller edit only when `Strings` is active. Tools must not switch the active layer. The toolbox should show only the tools that apply to the active layer, plus global navigation/actions such as select, pan, zoom and delete.

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

## Current Limitations

- Reference image import is still pending. The product should support SVG plus raster image references such as JPG, PNG, BMP and WebP.
- Freehand trace is pending. AI trace is intentionally out of scope for now.
- The first electrical validation covers missing controller signal paths, multiple output roots and serial branches. It must pass before Animate is enabled.
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
