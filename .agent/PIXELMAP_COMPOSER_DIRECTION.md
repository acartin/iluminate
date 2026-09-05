# PixelMap Composer Direction

**Last updated:** 2026-09-05
**Purpose:** preserve the current product/architecture direction for the real sign composer.

## Current Decision

Iluminate is moving from matrix-only tests toward a fabrication-oriented composer.

The operator should not be forced to understand the hidden mega matrix, firmware indices or `pixelMap` internals. The operator works on the real sign drawing:

```text
SVG/render of the sign
-> visual zones
-> continuous LED routes plus optional data cables
-> generated real LED points
-> pixelMap
-> effects
```

The hidden technical model remains:

```text
effect field over virtual coordinate space
sampled by real georeferenced LEDs
```

## Core Concepts

### Canvas

The uploaded SVG or traced sign establishes a real canvas. The canvas should be scaled in physical units, eventually cm/mm.

The "mega grid" is only an internal coordinate reference. It is not the primary UI.

### Zones

Zones are visible business/fabrication objects:

- `letter_C`
- `letter_A`
- `letter_R`
- `word_CARIBE`
- `logo`
- `background`
- `full_sign`

Zones can be drawn as rectangles, circles, polygons or, later, selected SVG contours. A zone defines:

- valid area;
- bounds;
- local coordinate space;
- membership for LEDs that fall inside it.

The same LED can belong to several zones:

```text
LED 137 -> letter_C -> word_CARIBE -> full_sign
```

Effects may use:

- global sign coordinates;
- local zone coordinates;
- group/word coordinates;
- sequential element order.

### LED Density

One project uses one LED density.

Default can be `60 LEDs/m`, but it must be configurable when the project starts.

Changing density resets existing LED routes/cabling, because it changes physical spacing, generated LED count, indices, power estimates and the final `pixelMap`.

Do not add per-route density yet.

### LED Routes

The operator draws continuous LED routes over the sign.

Rule for the operator:

```text
A LED route must be continuous and directional.
```

The route represents real serial wiring. For example, a letter may be wired as:

```text
entry at top
down
up
down
continue to next letter
```

The system samples the route using the project LED density:

```text
60 LEDs/m -> one LED every 16.67 mm
```

Each generated LED receives:

- output number;
- serial index;
- global x/y;
- zone memberships;
- local coordinates per relevant zone.

### Data Cables And Controller

The Designer also models green `Data cable` routes for signal planning. Data cables do not generate LEDs or pixelMap entries.

The controller card is part of the canvas:

- it is movable and persisted;
- it is not deletable;
- it starts with 3 red output ports;
- controller ports connect only to the green/input terminal of a data cable;
- a connected port and joint render cyan.

Snap/solder behavior is exact-grid based:

- no tolerance-based soldering;
- no separate solder/cautin tool;
- route green + route red on the same snap point solders;
- controller red port + data-cable green terminal on the same snap point solders;
- floating cyan joints must be cleaned when routes are deleted.

### pixelMap

`pixelMap` is the generated georeferencing layer:

```json
{
  "output": 1,
  "index": 137,
  "x": 42.6,
  "y": 18.3,
  "segmentId": "letter_c_route_2"
}
```

It is the bridge between:

```text
physical wiring -> visual coordinates -> effects -> firmware output
```

The operator should not manually edit raw `pixelMap` in normal workflows.

## Product UI Direction

The real composer should not start from matrix presets.

Matrix presets remain useful for `Effect Lab`.

The production composer should flow like this:

1. Upload SVG or sign drawing.
2. Set project scale and one LED density.
3. Define zones over the sign.
4. Show optional snap/grid/pitch guides only when routing LEDs.
5. Draw continuous LED routes.
6. Validate route continuity, LED count, output capacity, LEDs outside zones and sparse areas.
7. Generate `pixelMap`.
8. Run effects against the generated map.

## Effect Semantics

Effects should be tested on ideal Lab templates, but production effects run by sampling real georeferenced LEDs.

Important modes:

- `Whole Sign`: use global coordinate space.
- `Each Element`: run the same effect independently per element/zone.
- `Sequential Elements`: activate elements left-to-right or by explicit order, using local coordinates per element.

Examples:

- Fire over entire sign: global coordinates.
- Blue wave crossing all letters: global or word coordinates.
- Yellow fill letter by letter: sequential elements + local fill.
- Fire inside each letter independently: each element + local coordinates.

## Current Implementation Status

Implemented so far:

- `lighting-core` owns partitura types, validation, generation and simulation.
- `pixelMap` is generated and validated.
- `services/lighting-core/pixel-map/` exists as an internal module.
- Web simulator renders `pixelMap` coordinates.
- `/partituras/designer` lists partituras using the platform grid pattern.
- `/partituras/designer/[id]` opens a full-screen Designer studio.
- The Designer supports selection, copy, paste, delete, zoom, pan, rulers, snap, rectangle/ellipse zones, LED strings, data cables, route point editing, route cutting and exact snap soldering.
- The controller card supports red output ports, data-cable attachment and moving attached cables when the controller is dragged.
- `Effect Lab` exists in the partitura workspace with:
  - matrix presets;
  - two-panel preset;
  - five/six letter sign templates;
  - apply modes: whole sign, each element, sequential elements.
- Effects currently being explored:
  - `flame`;
  - `spatial_fill`;
  - `spatial_wave`;
  - linear effects like `chase`, `toggle`, `pulse`.

Not yet implemented:

- SVG upload/composer.
- Polygon/freeform zone drawing.
- Zone-local coordinate serialization in final generated artifact.
- Visual electrical validation workflow.
- Density-change warning/reset workflow.
- Cutting or separating soldered joints.

## Important Guidance For Future Agents

- Do not make the production composer a raw matrix editor.
- Do not expose the hidden mega grid as the primary concept.
- Do not add per-route LED density unless explicitly revisited.
- Do not treat firmware as the priority while effects/composer concepts are still being shaped.
- Keep `pixelMap` as generated data, not as the normal editing surface.
- Use the Effect Lab to test effect behavior, not fabrication workflows.
- Read `.agent/DESIGNER_HANDOFF.md` before changing Designer routing, soldering, controller or defaults.
