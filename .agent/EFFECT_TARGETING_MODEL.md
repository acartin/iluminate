# Effect Targeting Model

**Status:** canonical product decision
**Last updated:** 2026-09-10

## Decision

The physical wiring model and the visual effect model are deliberately separate.

```text
controller + data cables + LED strings
-> electrical topology and serial order
-> generated pixelMap
-> zones and groups select pixels
-> clips/effects render those selected pixels
```

The operator does **not** create, name, or assign logical LED segments as part of
the normal Designer workflow.

## Physical Model

- A `Data cable` and an `LED string` are directed physical routes.
- A route has a green DIN/start terminal, a red DOUT/end terminal, fabrication
  nodes, and exact snap solder joints.
- The controller plus route joints form the electrical graph.
- That graph determines the output and serial sequence for every addressable
  pixel. For a pixel at `output + serialIndex`, its predecessor and successor
  are inferred from adjacent indices on that same output; explicit pointers are
  unnecessary.
- A fabrication leg is the portion of a route between two route nodes. It is a
  construction detail, not a normal effect target.

## pixelMap

The generated `pixelMap` is the bridge between both worlds. Every addressable
pixel must be resolvable to at least:

```text
output, serialIndex, LED-string route, x/y in cm, route tangent/direction
```

It may also carry generated zone memberships and local coordinates. It is never
the normal editing surface for an operator.

## Visual Targets

Effects target only these normal authoring concepts:

- **Zone:** a named visual geometry, such as `L vertical`, `L base`, `star`,
  `background`, or `full sign`. It selects all pixelMap pixels inside that
  geometry. A pixel may belong to more than one zone.
- **Group:** a named collection of zones and/or other groups, for example
  `Letter L`, `word CARIBE`, or `full sign`. Groups create no pixels and do not
  alter wiring. They may nest, but cycles are invalid.

The UI should use zones and groups as the normal selectable targets for clips.
A string remains visible as physical fabrication information, not the ordinary
effect-authoring language.

## Effect Ordering And Coordinates

For the same selected pixels, an effect states how it interprets them:

- `serial`: order selected pixels by physical `output + serialIndex`. Used by
  chase, comet, serial fill, and comparable linear effects.
- `local`: normalize coordinates inside the selected zone/group. Used by an
  effect that should restart independently in each letter or element.
- `global`: use the common canvas/sign coordinate system. Used by a wave, fire,
  or gradient that crosses several letters as one composition.

Examples:

- A chase on `L vertical` follows only that zone's pixels in serial order.
- Fire on `full sign` samples all selected pixels in global coordinates.
- A yellow fill on group `CARIBE` can activate each child letter sequentially
  while using each child's local coordinates.

## Advanced Exception

A future advanced tool may expose an exact named range within a string when a
geometry cannot express the desired selection. It is an exception, not a
primary entity, UI workflow, or required partitura target type.

## Consequences For Implementation

1. Compile the electrical graph before compiling effects.
2. Generate the canonical physical pixelMap from the connected routes.
3. Resolve zone membership geometrically from pixel positions.
4. Resolve groups recursively and deduplicate their pixels.
5. Make simulator and firmware-facing artifacts consume the same resolved pixel
   targets. Do not maintain a separate manual `zone -> segment` assignment.
