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
with compact labels, icons or responsive hiding before adding another row.
Grouped menus are valid only where this contract explicitly assigns a coherent
group, such as global `Setup`; they are not an overflow mechanism for contextual
object actions. Vertical canvas space has priority.

## 1. Global Command Bar

The first/top bar contains only commands or state that remain valid regardless
of the selected tool or canvas object.

Canonical contents:

- Back and document identity.
- Design/Animate mode switch.
- Designer-wide setup: canvas units/size/snap, global alignment/calibration
  marks (enabled, locked, origin and measured spacing), CNC cutter
  diameter/unit, Pixels/m and LEDs/m. Cutter units are independent from canvas units; the physical
  diameter persists canonically in millimeters.
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

When a geometric node/path tool is active, this tool context takes precedence
over the previous object selection and immediately exposes the shared `New
node` type picker. The chosen type applies to each subsequently placed node and
may change between clicks. Build Area, Zone, Channel and Face Graphic path
tools use this same control and the same canonical node types (`corner`,
`straight`, `smooth`, `symmetric`); they must not implement layer-specific node
creation state. Electrical route points are terminals/cuts and are not part of
this geometric node-type contract.

With an object selected it shows:

- only properties relevant to that object or selected node, without repeating
  its name, active category or locked status;
- contextual actions such as Lighting, Configure source, Copy, Paste and
  Delete.

Every Layers category uses the same contextual-bar grammar, even when its
objects expose different capabilities:

```text
scrollable properties and contextual actions -> fixed Copy / Paste / Delete
```

### Mandatory contextual-action pattern

This is a cross-category interaction contract, not a per-object styling choice:

| Capability | Canonical placement | Presentation |
|---|---|---|
| Edits a value on the selected object or node | Scrollable contextual area | Direct field or selector |
| Runs one operation on the selected object | Scrollable contextual area | Visible short label, with an icon when one exists |
| Changes subsequent pointer behavior | Left tool rail | Icon-only tool with the shared hover description |
| Copy, Paste or Delete | Fixed trailing action group | Icon-only, always in that order when supported |
| Edits many related values | Right properties panel or focused dialog | One visible, specifically named launcher |
| Applies regardless of selection | Global bar or its established coherent group | Never inserted into object context |

The contextual bar must not contain an overflow button, generic ellipsis,
`More`, `Actions`, `Path operations`, or any equivalent renamed catch-all.
A specifically named launcher is allowed only when it opens one cohesive
editor, not a list of otherwise unrelated commands. When horizontal space is
tight, the scrollable contextual area scrolls; actions are compacted according
to this table, but capabilities are not hidden or moved to a catch-all menu.

New Layers categories and new selectable object types inherit this pattern by
default. Deviating from it requires an explicit product UX decision and an
update to this contract before implementation; local convenience, temporary
space pressure or the number of actions is not sufficient justification.

The common action group is fixed at the right edge and never scrolls away with
the properties. `Copy`, `Paste` and `Delete` are icon-only controls with the
shared accessible hover description. For copyable object kinds, `Paste`
occupies its position while disabled and becomes active only when the clipboard
contains a compatible object. Unsupported actions are omitted; consistency
means stable order and behavior, not inventing Copy/Delete semantics for a
singleton such as the controller.

Actions that define the selected object's workflow (`Create Zones`, `Convert
to paths`, `Generate Holes`, `Offset Path`, `Project Geometry` and compatible
legacy operations) remain visible in the contextual bar with concise labels
and their required parameters. A generic ellipsis/`More` menu or a renamed
catch-all operation menu must not hide an object's capabilities or become a
dumping ground for actions. Object and node properties remain directly visible.

Context precedence is strict: active path-tool context, multiple selection,
selected node, selected object, then no selection. With two or more compatible
profiles selected, the multiple-selection context replaces all properties and
single-object commands from the last-selected profile. It shows only the
selection count and the compact icon-and-label group for `Group`, `Union`,
`Subtract`, `Intersect` and `Exclude`. `Group` persists a same-layer authoring
group without merging geometry; selecting any member later restores the complete
group selection and Move translates every member together. For an exact grouped
selection, `Ungroup` replaces `Group` and removes only the relationship, leaving
all vectors unchanged and selected. This authoring group is separate from the
electrical/effect Zone groups in Layers. Single-object Copy/Paste/Delete remain hidden until those actions
have real batch semantics.

Examples:

- Zone: selected-node type plus parametric dimensions for native primitives.
  Rectangles expose `W/H` and ellipses expose `ØW/ØH`; polygon width/height,
  shape conversion and element/node X/Y stay out of the contextual bar.
  Canvas manipulation remains the geometry editing surface for paths.
- Channel: router-bit diameter, open/closed path, ends and node type. Channel
  node coordinates stay off the contextual bar. When a corner node is selected,
  one numeric `Fillet` field in millimeters edits that node directly and redraws
  the center trace immediately. There is no separate activation mode, passive
  Fillet badge, Setup Fillet setting or Channel-specific `Round corner` command.
- Active Channel tool: one router-bit selector containing common metric and
  fractional-inch diameters; every option shows both units. The diameter is the
  live trace width and the width of the created channel. Millimeters remain the
  canonical stored value.
  Manual tracing remains the primary interaction. When geometric profiles were
  selected before activating Channel, the same context also offers `Left edge`,
  `Center` or `Right edge` alignment and `Generate Channel`. Endpoint-
  connected profiles are ordered into independent chains; branching selections
  are rejected with guidance to trace each physical route manually. Generated
  Channels are independent editable copies. A Channel generated from one Zone
  inherits that Zone's name. The most recently selected router-bit diameter is
  persisted and reused by both manual and generated Channels.
  New open channels use round ends with an implicit radius of half that
  diameter; a flat end remains an explicit per-channel choice.
  Bezier handles remain freely draggable. Designer does not estimate or warn
  about Channel bend radii; the operator may apply `Fillet` explicitly where a
  manufactured corner needs it.
- Artwork/reference: size, shape and node-type fields. A selected SVG
  Artwork exposes `Create Zones`; it creates one editable Zone per closed SVG
  filled region at the Artwork's displayed position and scale, separates
  disconnected subpaths into independently selectable Zones, preserves nested
  counters as compound holes and skips open/non-vector content with a notice.
  It never consumes, hides, moves or otherwise mutates the Artwork source or
  any existing layer/object visibility; visibility remains operator-controlled.
- Route: route type and editing actions. Delete removes the selected route even
  when it is the final route in the document; an empty Strings collection is a
  valid authored state.
- Controller: port count.
- Light source: source type and Configure source.
- Face Graphic: pass mode, translucent filter color, selected-node type and
  parametric dimensions for native primitives. Rectangles expose `W/H` and
  ellipses expose `ØW/ØH`. Locking remains exclusively in Layers; shape
  conversion, polygon dimensions and compound-contour summary stay out of the
  contextual bar.
- Legacy projected geometry: linked/broken status, source selector and Delete.
  It has no editable shape or node fields while linked. New `Project Geometry`
  operations do not create linked projection records.
- Legacy derived offset/fillet geometry: a fixed-width status indicator,
  source selector, signed offset distance plus join control or fillet radius
  plus corner list and Delete. Only a legacy live Fillet retains `Break Link`;
  new offsets are native and independent from creation. Warnings use the same
  status slot and must not insert text capsules that shift numeric controls
  while editing. A newly generated native offset may be recalculated directly
  by its distance/join controls while it remains selected; this does not persist
  a source link. Legacy derived results remain read-only on canvas while live.
- Editable text: content, controlled font, size/tracking in millimeters, line
  height, alignment and `Convert to paths`.
- Work line: optional organizational owner (`Global`, `Artwork`, `Diffusors` or
  `Face Graphic`) and selected-node identity. Nodes and the complete open
  polyline remain directly movable; Delete removes a selected node when at
  least two nodes remain, or removes the selected line.

Delete is one consistently destructive red action at the end of the contextual
bar. Selecting a node reuses that same action instead of inserting a second
Delete button beside node properties. Other destructive controls in Designer
use the same shared destructive button treatment.

Zone, Channel and Face Graphic objects selected from Layers reuse the exact
Artwork `Copy`, disabled/enabled `Paste` and `Delete` icon controls in the fixed
trailing action group.
Those object-level actions remain available when the category or Face Graphic
object is locked; locking prevents geometry edits and movement, not explicit
copying or deletion from the contextual bar.

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
- Move. It moves the complete object without exposing node or resize-handle
  editing. Its contextual control fixes movement to X or Y; holding Ctrl (or
  Command on macOS) temporarily releases the constraint and permits movement
  on both axes. Escape returns to Select. Select never starts whole-object
  movement, and an initial object click cannot accidentally drag one of its
  nodes or resize handles.
- Pan.
- Measure.
- Work line. It creates a straight, open, continuous construction polyline and
  finishes with Enter or double-click. It is available from Artwork, Reference,
  Diffusors and Face Graphic, but every existing or new Work Line is grouped
  inside the dedicated `Work Lines` folder under `Artwork`; completing or
  selecting one activates that destination. The Artwork master eye controls
  the complete contents of Images, Reference and Work Lines. Each folder also
  has a bulk visibility eye; individual work lines do not expose separate eye
  controls. Selecting a Work Line exposes `Generate Holes`, which creates an
  independent clear Face Graphic circle at every unique Work Line crossing;
  Setup persists the shared `Hole diameter` in millimeters and generated hole
  circles use a continuous outline. Repeating `Generate Holes` skips every
  crossing coordinate that already has a generated Work Line hole.

The remaining tools depend on the active layer, for example image placement,
reference/zone/channel drawing, LED string, data cable and route cutting.
Face Graphic uses the same rectangle, ellipse, polygon and Bezier interaction
as the other geometric layers; only its semantic properties differ.
Its Layers category header owns a transient black/white vinyl-preview toggle:
opaque and uncovered face material render black, while clear and translucent
regions render white. The mode remains local to Design, does not persist or
affect Compile/export/Animate, and keeps selected geometry and nodes visible.
When expanded, Face Graphic also exposes one compact visibility-preset row.
`All on` and `All off` apply immediately; named presets can be created from the
current object-eye state, reapplied, updated and deleted. Applying a preset only
changes individual Face Graphic eyes (native objects, projections, derived
profiles and compatible text). It does not run export or change geometry.

Across the entire Layers panel, visibility and lock controls use one state
language: visible is blue, hidden is neutral gray, locked is red and unlocked
is green. The same colors apply to category headers and object rows.

In Animate `As built`, the first Face Graphic object in layer order is the
frontmost physical filter. Defined `clear`, `opaque` and `translucent` regions
control only frontal light; uncovered face area is opaque once any Face Graphic
exists. An object's eye state controls its membership in both this preview and
the physical mask; layer visibility and opacity remain Design presentation
controls. `LED map` is the explicit raw,
unfiltered diagnostic view. Halo and Wall Wash are always outside this pass.
Animate also exposes a transient `Face mask` checkbox in `As built`, enabled by
default, so the operator can compare filtered and unfiltered Front output. It
never persists or changes fabrication/export semantics.

Reference, Diffusors and Face Graphic do not expose a Text creation tool. The
controlled text implementation remains available underneath for compatibility
with existing documents: persisted text remains selectable and movable, and
its contextual fields support single-line/basic multiline content, controlled
Iluminate Sans regular/bold, size, tracking, line height and alignment. Never
expose an arbitrary browser/OS font picker.

`Convert to paths` is a contextual command. It verifies the controlled font
resource and replaces the text with a native compound Bezier profile in one
Undo transaction. The resulting object uses the normal category semantics and
may immediately participate in Project Geometry, booleans, offsets and fillets.

`Project Geometry` is a contextual object command, not a rail tool. With a
geometric source selected, the contextual bar exposes a target selector
(`Face Graphic`, `Diffusors` or `Reference`) and the command. It immediately
creates an independent native object in the target layer; there is no new live
link or `Break Link` step. The active layer, selected source and contextual
focus remain unchanged so the operator can project several objects quickly.
Legacy linked projections remain readable and repairable through their source
selector.

A selected Channel uses this same `Project Geometry` command. The original
Channel remains the editable and exportable centerline object; the generated
native object receives the complete swept perimeter, including width, ends and
corner fillets. Projecting to Face Graphic therefore creates the second,
independently visible perimeter object without adding another command or
changing the current focus.

Boolean geometry is also contextual, not a rail mode. Select the first/base
profile normally, then use Shift/Ctrl/Command-click to add profiles from the
same layer. With two or more profiles selected, the contextual bar exposes
`Union`, `Subtract`, `Intersect` and `Exclude`. Subtract removes every later
selection from the first selection. The command produces one selected native
object and is one Undo/Redo transaction. A linked projection may participate as
a construction operand without being consumed.

Compound results do not add a contour-summary capsule to the contextual bar.
Their holes must remain visibly empty and must not receive canvas hits or zone
pixels. The whole profile may be moved/resized. When selected, every contour
exposes its native nodes; node selection uses one stable flattened index
internally while the UI identifies the local contour and point. Moving a node
or Bezier handle updates only that contour and preserves the other contours and
the compound fill.
Node hit-testing is screen-sized and always chooses the nearest visible node,
with the currently selected object's nodes taking precedence over overlapping
objects. A double-click on or near a node selects it; it must not insert another
node. Insertion occurs only when the double-click is close to an edge.
Changing a node to smooth or symmetric must activate and persist both handles
on that node's own contour, including materialized compound paths; a top-level
Bezier flag must not leave the edited contour rendered as straight.

A selected native polygon exposes the contextual `Trim` pointer tool in the
left rail. It appears only for a compatible single selection; its guidance uses
the contextual bar while active. Paper.js
resolves its crossing graph into exact closed faces. Hovering inside or along a
face previews that face in red, the retained profile in cyan and the source
crossings in amber. The smallest face containing the pointer wins before
nearest-stroke fallback, so selection never depends on traversal order. Click
commits; `Esc` cancels; Undo restores the original path. Remaining resolved
faces stay selectable in subsequent Trim passes, including after the object
becomes compound. Invalid/open outcomes must not be committed. The same
interaction applies to Reference, Zones and Face Graphic and preserves native
Bezier segments. Channels expose the same rail `Trim` tool while their center
trace is selected. For a Channel, the hovered crossing loop is spliced from the
center trace, preserving its open/closed state, width, cap and semantic identity
instead of converting it into a filled or compound profile.

`Offset Path` is a contextual object command that creates a new independent
native result in the same target layer. Its signed millimeter distance and
Round, Miter or Bevel join are selected before executing the command. The last
distance and join are persisted with the Designer document and reused by the
next operation. It creates no live link and requires no `Break Link` step.
For native Reference, Zone and Face Graphic paths, the contextual `Fillet`
pointer tool appears in the left rail and activates direct node editing: the contextual radius
stays active while each corner click mutates that same native object, remains
active for subsequent nodes and records one Undo step per click. If a corner
node is already selected, activating `Fillet` applies the current radius to it
immediately and keeps that node visibly selected. Changing the radius then
recalculates that same selected corner from its
pre-fillet geometry instead of stacking another fillet; zero restores the
corner. `Esc` exits.
There is no preview, Apply step, derived object or Break Link in this native
workflow. Direct native Fillet recalculates and trims the neighboring segments
to preserve the exact requested radius; it must never substitute the maximum
smaller radius. When the existing Bezier spans cannot contain the requested
circle, their local joins are adjusted. Dense materialized paths must consume
the sampling nodes covered by the tangent span; they must not create a local
fold by retaining micro-segments inside the requested radius. A smooth node
that still forms a visible anchor corner may use its support legs, while an
existing exact circular span must not receive a stacked second fillet. A result or blocking topology warning is
reported beside the active Fillet controls and must not be hidden only in the
global bar. A node without a usable tangent solution remains unchanged. The last Custom radius persists with the
Designer document and must be the value used by the next canvas click after
Save/reload; choosing the router-bit source uses half of the current cutter
diameter without overwriting that Custom value. Linked/read-only geometry retains the live
derived Fillet workflow until materialized. Channels remain the semantic
center-line exception: select a canonical Channel corner node and edit its
inline `Fillet` radius directly. The Channel redraws on every numeric change,
preserves the original anchor and creates no derived profile. A zero radius
removes the fillet. Neither workflow takes its radius from the cutter or
router-bit diameter.

The Layers panel shows legacy derived profiles in their persisted target
category. Broken, cyclic, collapsed and invalid-topology results remain
selectable and must show a repairable status. Radius clamps and join fallbacks
show warnings. `Break Link` remains only for valid legacy live Fillet results.

A live derived profile whose target is Face Graphic exposes the same `Pass` and
translucent `Filter color` controls as a native Face Graphic object. These are
mask properties, not lighting properties: do not add diffusion, LED pitch,
source distance or effect controls to the derived profile. The values remain
active in As built and fabrication export even when the editor eye is hidden.

The rail must not contain command actions. Do not add Delete, Copy, Paste,
Undo, Redo, Fit, Zoom buttons, Save, Compile, Layers or object parameters to
the rail. Mouse wheel/trackpad handles zoom; Fit belongs to the global bar;
Delete belongs to the contextual bar and keyboard shortcut.

Fabrication `Export` belongs to the Design global bar. It opens a modal rather
than becoming a rail mode. The modal exposes output-category checkboxes, an
independent checkbox for repeating enabled alignment marks in every file,
millimeter DXF curve tolerance, minimum-feature guidance, validation results
and separate SVG/DXF downloads. Blocking errors must prevent download and stay
visible; warnings must remain visible but allow export. Never imply that this
dialog generates CAM toolpaths, STL or a machine-specific cut file.

Ruler visibility and distance measurement are different functions and must not
share the same icon. The global Ruler control uses the ruler icon. The Measure
tool uses the Lucide `ruler-dimension-line` icon so the operator can distinguish
view state from an active canvas tool without reading a tooltip.

## Category Activation And Selection Synchronization

Category activation must be immediate and deterministic:

- Clicking a category name, its disclosure arrow or one of its folders makes
  that category the active canvas layer and returns the pointer to Select.
- Once active, every visible object belonging to that category can be selected
  on the canvas. Zooming or panning must never be required to "finish"
  activation.
- Hidden layers and hidden objects are not selectable.
- Locked layers remain selectable for identification and inspection, but no
  geometry, property or drawing mutation is allowed. Layers communicates the
  locked state; the contextual bar does not add a locked-status capsule. Lock
  means immutable, not invisible and not uninspectable. Explicit contextual
  Copy/Delete exceptions are defined above for Zone, Channel and Face Graphic.
- Zone and Channel rows are ordered front-to-back: the first row is the topmost
  object and wins selection when objects of the same kind overlap. Channels
  are foreground diffuser paths and therefore win over an overlapping Zone.
  Dragging a row changes this persisted drawing and hit-test order.
- The Diffusors `Zones` and `Channels` folder headers each expose a master eye.
  Switching it writes the same visibility state to every native object in that
  folder in one transaction, so all child eyes immediately match. The
  `Zones Groups` folder remains organizational because groups have no canvas
  geometry or independent visibility state.
- Diffusors exposes the same compact named-visibility manager as Face Graphic,
  backed by its own independent preset collection. A preset captures Zones,
  Channels, projected/derived geometry and controlled text belonging to
  Diffusors. `All on`, `All off`, create, apply, update and delete affect only
  those object eyes; Zones Groups remain excluded.

Canvas selection and Layers navigation are one synchronized state:

- Selecting an object on the canvas opens the Layers panel if necessary.
- It activates and expands the object's parent category.
- It expands the exact containing folder and scrolls the selected row into
  view.
- Mapping is fixed: artwork -> `Artwork / Images`; build area -> `Artwork /
  Reference`; zone -> `Diffusors / Zones`; channel -> `Diffusors / Channels`;
  Face Graphic object -> `Face Graphic`;
  projected geometry -> its persisted target category (`Artwork / Reference`,
  `Diffusors / Zones` or `Face Graphic`);
  derived geometry -> its persisted target category (`Artwork / Reference`,
  `Diffusors / Zones` or `Face Graphic`);
  editable text -> its persisted target category (`Artwork / Reference`,
  `Diffusors / Zones` or `Face Graphic`);
  data cable -> `Hardware / Data cables`; LED string -> `Hardware / Strings`;
  controller -> `Hardware / Controller`.
- Hardware owns one transient `Rear / Front / Both` display filter shared by
  Strings and Data cables. Every route persists only its Designer mounting-face
  classification (`rear` or `front`); newly drawn routes inherit the last
  single-surface view. Filtering removes the other surface from canvas drawing,
  hit testing, snapping and both route folders without changing route eyes,
  joints, outputs, serial order, lighting setup, Compile, export or Animate.
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

Lighting status and setup remain in the panel. The contextual bar does not
repeat lighting modes, materials, incomplete states or an empty-state legend.

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
- no contextual workflow action was moved behind an ellipsis, overflow menu or
  renamed catch-all operation menu;
- direct fields, visible object commands, pointer tools and the fixed trailing
  action group still follow the mandatory placement table;
- the production build and Designer smoke flow still pass.

Changing this contract requires an explicit UX decision, an update to this
file and corresponding updates to `DESIGNER_HANDOFF.md`. A feature request by
itself is not permission to erode the layout hierarchy.
