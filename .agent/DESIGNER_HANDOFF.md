# Iluminate Designer Handoff

**Last updated:** 2026-09-05
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
-> compile layout into segments/pixelMap
```

The Designer is intentionally fabrication-oriented. It is not a raw matrix editor and it is not the old technical Layout tab.

## Primary Routes And Files

- Grid entry: `/partituras/designer`
- Full-screen editor: `/partituras/designer/[id]`
- Main UI: `services/web/iluminate/components/lighting/partitura-workspace.tsx`
- Grid wrapper: `services/web/iluminate/components/lighting/partitura-designer-workbench.tsx`
- Model/defaults/normalization: `services/web/iluminate/lib/lighting/partitura-model.ts`
- Server persistence: `services/web/iluminate/lib/server/partituras.ts`
- Menu config: `services/web/iluminate/lib/api.ts`
- Sidebar icon/style: `services/web/iluminate/components/portal/sidebar.tsx`

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
- Density `60 LED/m`.
- Snap `2 cm`.
- Three controller outputs by default.

Do not put default zones/routes underneath the controller. If a screenshot shows the PCB overlapping Fondo or a route, the document is likely old/persisted or the defaults regressed.

## Visual Vocabulary

### Route Types

- `LED string`: amber/orange LED strip. It generates LED dots, segments and pixelMap data.
- `Data cable`: green signal cable. It is visual/planning geometry only and does not generate LEDs.

### Terminals And Direction

- Route green terminal: input/start/DIN.
- Route red terminal: output/end/DOUT.
- Controller port: red output terminal.
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
- To avoid detach bugs during controller drag, use a snapshot of the original routes captured at drag start.

## Current Tools

Left toolbox:

- Select.
- Rectangle zone.
- Ellipse zone.
- LED string.
- Data cable.
- Cut route.
- Delete selected.
- Pan.
- Zoom in/out/fit.

There is no solder/cautin tool. Do not add it back.

Top command/context bars:

- Back.
- Copy/paste/delete also exist in the top command area, but delete in the toolbox is more intuitive for canvas editing.
- Save.
- Compile.
- Canvas settings: ruler unit, ruler visibility, width, height, LED density, snap.
- Selected object properties appear in the contextual bar.

## Current Limitations

- SVG import is still pending.
- Polygon/freeform zones are pending.
- Electrical validation is conceptual, not implemented.
- Cutting welded joints needs a future UX decision.
- LED density changes do not yet reset/recompute routing with a warning.
- Raw pixelMap should remain hidden from normal operators.
- Layout tab is technical/debug; the Designer is the production direction.

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
