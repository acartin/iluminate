# Designer UX Contract

**Status:** mandatory. This document is the canonical layout contract for the
Designer studio. Read it before changing `partitura-workspace.tsx`, the Designer
tool rail, either top bar, Layers navigation, or Animate workspace controls.

The purpose of this contract is to keep controls organized by scope. New
features must fit this structure; they must not gradually turn the first bar or
the tool rail into a collection of unrelated buttons.

## Fixed Studio Structure

The Designer has exactly these primary UI regions:

```text
Global command bar
Contextual properties bar (Design only)
Tool rail | Canvas | Layers/properties panel
Animate timeline when Animate mode is active
```

Do not add a third horizontal command/properties bar. Recover horizontal space
with compact labels, icons, grouped menus or responsive hiding before adding
another row. Vertical canvas space has priority.

## 1. Global Command Bar

The first/top bar contains only commands or state that remain valid regardless
of the selected tool or canvas object.

Canonical contents:

- Back and document identity.
- Design/Animate mode switch.
- Designer-wide setup: units, canvas width/height, snap, Pixels/m and LEDs/m.
  These settings stay grouped under `Setup`; do not expand all of them into the
  bar.
- Global view commands: rulers and fit-to-view.
- Layers panel toggle and active-layer identification.
- Compile state, issue count and global fabrication status.
- Theme, Undo, Redo, Compile and Save.
- In Animate mode: preview type, an always-labeled `Outlines` checkbox and fullscreen Viewer. Outlines is a visibility state, not a square-shaped drawing-tool button.

Save remains gray and disabled when the current persistent document matches the
last server-confirmed version. It turns amber and becomes actionable when
there are unsaved changes; returning to the saved state through Undo returns it
to gray. Preview/playhead movement does not mark the document dirty. Compile
uses the same amber pending-state color and a build/compile icon, then returns
to gray when current. Every icon-only control exposes the same accessible hover
description through `title` and `aria-label`.

Selection-dependent actions or fields do not belong here. In particular, do
not place object coordinates, shape/path fields, node controls, Lighting,
Copy/Paste or Delete in this bar.

## 2. Contextual Properties Bar

The second bar exists only in Design and describes the current editing context.
Its contents must change with the active tool or selected object. Animate must
not reserve an empty contextual row: its calibration lives in the right panel
and its scene/track/clip controls live in the timeline toolbar.

With no object selected it shows:

- active tool name;
- a short instruction for using that tool;
- active layer or a prompt to choose one.

With an object selected it shows:

- object name/identity;
- only properties relevant to that object or selected node;
- contextual actions such as Lighting, Configure source, Copy, Paste and
  Delete.

Examples:

- Zone: Lighting, shape, position/size, selected-node fields.
- Channel: Lighting, width, open/closed path, ends, node and fillet fields.
- Artwork/reference: position, size, shape and node fields.
- Route: route type and editing actions.
- Controller: position and port count.
- Light source: source type and Configure source.

The contextual bar may scroll horizontally when an object genuinely has many
properties. It must not absorb document-wide configuration merely because
space is available.

For a selected soldered route node, the scissors in the Strings tool rail acts
immediately as `Detach solder joint`; it does not appear in the contextual
properties bar. Detaching never deletes route geometry. A controller/cable or
mixed cable/string joint clears the selected connection and any newly floating
counterpart marker. A same-kind cable/cable or string/string joint, which
persistence represents as one merged route, splits back into two independent
routes at that node. Without a soldered node selected, the same scissors keeps
its existing `Cut route` pointer mode. This explicit Strings workflow is the
sole exception to the general command-placement rule for the tool rail.

## 3. Left Tool Rail

The left rail contains tools: modes that change what pointer interaction does
on the canvas.

Always-available tools:

- Select.
- Pan.
- Measure.

The remaining tools depend on the active layer, for example image placement,
reference/zone/channel drawing, LED string, data cable and route cutting.

The rail must not contain command actions. Do not add Delete, Copy, Paste,
Undo, Redo, Fit, Zoom buttons, Save, Compile, Layers or object parameters to
the rail. Mouse wheel/trackpad handles zoom; Fit belongs to the global bar;
Delete belongs to the contextual bar and keyboard shortcut.

Ruler visibility and distance measurement are different functions and must not
share the same icon. The global Ruler control uses the ruler icon. The Measure
tool uses a measuring-tape icon so the operator can distinguish view state from
an active canvas tool without reading a tooltip.

## Category Activation And Selection Synchronization

Category activation must be immediate and deterministic:

- Clicking a category name, its disclosure arrow or one of its folders makes
  that category the active canvas layer and returns the pointer to Select.
- Once active, every visible object belonging to that category can be selected
  on the canvas. Zooming or panning must never be required to "finish"
  activation.
- Hidden layers and hidden objects are not selectable.
- Locked layers remain selectable for identification and inspection, but no
  geometry, property, delete or drawing mutation is allowed. The contextual
  bar must identify the selection as `Locked · inspect only`. Lock means
  immutable, not invisible and not uninspectable.

Canvas selection and Layers navigation are one synchronized state:

- Selecting an object on the canvas opens the Layers panel if necessary.
- It activates and expands the object's parent category.
- It expands the exact containing folder and scrolls the selected row into
  view.
- Mapping is fixed: artwork -> `Artwork / Images`; build area -> `Artwork /
  Reference`; zone -> `Diffusors / Zones`; channel -> `Diffusors / Channels`;
  data cable -> `Strings / Data cables`; LED string -> `Strings / LED strings`;
  controller -> `Hardware`.
- The same mapping must be used by canvas selection and panel selection; do not
  maintain competing ad-hoc mappings in separate components.

`Light Sources` is not a Layers category. A Front, Halo-Lit or Wall Washer
record has no independent canvas geometry or drawing tool; it is a Lighting
Setup owned by a zone or channel. It must be reached from that owner rather
than presented as an activatable canvas plane. Keep the persisted
`designer.lightSources` name temporarily for document compatibility until a
separate, explicit data migration renames it; the legacy field name is not
permission to restore the Layers category.

## Lighting Construction Versus Animate Calibration

Lighting construction belongs to Design. Only Design may create, enable,
disable or remove Front, Halo-Lit and Wall Washer sources, rename a source,
assign LED strings, choose the installed front material/diffuser or choose the
physical receiver. These are installation attributes, not animation controls.

Animate may tune only calibration parameters of sources that already exist:

- Front: intensity and the applicable distance, softness, transmission and
  beam calibration for its installed material.
- Halo-Lit: intensity, spread, softness, wall gap and face color.
- Wall Washer: intensity, spread, softness, direction, throw, beam and falloff.

Animate must not show mode enable checkboxes, Add/Remove, source naming, LED
string assignment, material selection or receiver selection. If the selected
target has no configured source, Animate directs the operator to Design.

Selecting a timeline clip must keep that clip selected and select/highlight its
owning zone or channel on the Animate canvas. Modern clips normally target a
Front, Halo-Lit or Wall Washer source ID; the UI must resolve that source's
`targetType` and `targetId` instead of treating the non-geometric source record
as the canvas selection. Direct legacy zone/channel targets remain supported.
Changing a clip's Target field applies the same synchronization rule.

Creating a clip always places it on the last completely empty track. If every
existing track contains at least one clip, creation adds a new final track and
places the clip there. Automatic creation must never stack a new clip over an
existing clip, regardless of the selected clip or playhead position.

When a timeline edit requires regenerating an active preview, playback pauses
internally until the new runtime partitura is installed and then resumes. The
old frame loop must not run concurrently with structural track/clip updates.
The playhead is one DOM element, moves with an integer-pixel composited
transform and remains inside the timeline bounds. At zoom 1 horizontal overflow
is hidden; above zoom 1 the horizontal scrollbar is permanently reserved. The
playhead must never toggle scrollbar visibility near the scene endpoint or draw
a second vertical indicator.

Opening a zone/channel Lighting Setup belongs to a persistent lightbulb action on that
object's row inside `Diffusors / Zones` or `Diffusors / Channels`. Do not put a
large `Lighting`/`Lighting Sources` modal button back into the contextual bar.
Zone/channel rows omit duplicated geometry descriptions already available in
the contextual bar.

When a zone or channel is selected, the contextual bar uses compact status
icons only:

- mounting icons for configured Front, Halo-Lit and Wall Washer setups;
- a material icon for the Front installation (`LED Pixels`, `Silicone Strip`,
  `Milky White` or `Day/Night`);
- an incomplete-warning icon when a setup is enabled but has no LED string;
- `No lighting setup` when no enabled setup exists.

A setup counts as configured only when it is enabled and has at least one LED
string. Persisted placeholder/migration records must not appear as real
installations merely because an array entry exists. Every icon requires an
accessible label/tooltip; icon shape alone is not the domain contract.

## Placement Test For New Controls

Before adding or moving any Designer control, apply this test in order:

1. Does it change pointer behavior on the canvas? Put it in the left tool rail.
2. Does it apply to the selected object, node or active tool only? Put it in the
   contextual bar.
3. Does it apply to the document, workspace, view, history, persistence or
   compilation regardless of selection? Put it in the global bar.
4. Is it a detailed, multi-field editor that would overload the contextual
   bar? Open or keep it in the right properties panel, launched from the
   contextual bar.

If none applies cleanly, stop and document the UX decision before adding the
control. Do not place it wherever there is temporary empty space.

## Responsiveness Rules

- Preserve the two-bar hierarchy at normal browser zoom.
- Prefer icon-only presentation with accessible `title`/`aria-label` at narrow
  widths; reveal labels at wider breakpoints.
- Group low-frequency global settings inside `Setup`.
- Keep the document name truncatable so it cannot push commands off-screen.
- Preserve a dominant canvas area; controls must not create unnecessary
  vertical rows.
- Design and Animate share one visual density: command/context/timeline controls
  are 32 px high with 16 px primary icons. The Design tool rail uses 32 x 32 px
  buttons and 16 px icons; compact Layers row actions use 14 px icons. This is a
  presentation contract only and must not relocate controls or change their
  behavior.
- The global bar and Design contextual bar are both 40 px high, leaving 4 px of
  vertical clearance around 32 px controls. Animate omits the contextual bar.
  Do not restore the former 48/44 px heights or a second technical identifier
  below the visible partitura name.
- Do not remove an existing capability to make the layout fit. Relocate or
  compact it according to this contract.

## Change Checklist

Any change to Designer navigation or controls must verify:

- the global bar does not depend on the selected object/tool;
- the contextual bar changes correctly for no selection, each affected object
  type and selected nodes;
- the left rail contains tools only and still follows the active layer;
- category activation immediately enables selection of its visible objects;
- selecting each object type opens its exact category/folder and reveals its
  row;
- Layers contains canvas planes only; `Light Sources` is not restored as a
  category;
- locked objects are selectable for inspection but cannot be mutated;
- Ruler and Measure retain distinct icons and meanings;
- Design owns lighting construction and Animate exposes calibration only;
- Lighting Setup opens from the zone/channel row, while the contextual bar
  reports state with icons and never with a misleading source count;
- Design and Animate retain their mode-specific global controls;
- Undo/Redo, Compile, Save, Layers, Fit, Copy/Paste/Delete and Lighting remain
  reachable in their canonical regions;
- no third horizontal bar was introduced;
- the production build and Designer smoke flow still pass.

Changing this contract requires an explicit UX decision, an update to this
file and corresponding updates to `DESIGNER_HANDOFF.md`. A feature request by
itself is not permission to erode the layout hierarchy.
