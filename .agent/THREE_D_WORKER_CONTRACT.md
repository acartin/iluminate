# Iluminate 3D Worker Contract

**Status:** isolated worker, authenticated enqueue adapter and independent 3D Modeler canvas implemented.
**Last reviewed:** 2026-11-02.
**Purpose:** define ownership, isolation, security and artifact rules for the
bounded SVG-to-3D modeling capability and its future independent canvas.

## 1. Current State

`3d-worker` is an implemented, isolated queue-consumer service. At the time of
this contract:

- `services/3d-worker` contains the pinned Python/build123d runtime, contracts,
  validators, exporters, queue repository, migration and deterministic tests;
- `compose.yml` defines a hardened, non-root `3d-worker` with no ports;
- Compose places it on a dedicated network shared only with PostgreSQL, not on
  the normal application-service network;
- the service owns `iluminate.three_d_model_jobs` and the private R2 prefix
  defined below;
- the authenticated Next adapter validates tenant/project authority, persists
  `3d-model-document.v2`, stores original imported SVGs as private project
  Assets, materializes canonical Model Paths and enqueues jobs;
- `/3d-modeler` and `/3d-modeler/{projectId}` provide the independent project
  selector and technical authoring canvas;
- `/profiles` provides the internal system-administrator card library and
  `/profiles/{profileId}` reuses the Profile-only canvas for global
  cross-sections without a project, Model Path, Sweep or Solid Object context;
- Designer and Animate do not expose, invoke or navigate to 3D modeling;
- the canvas supports metric SVG normalization, fixed Paths, Profiles and
  Solid Objects collections, independent vector profile contours,
  corner/straight/smooth/symmetric nodes, Bezier handles, explicit Model Path/profile
  internal Sweep relations, direct Path/Profile assembly selection, current-operation status
  and an authenticated, independent 3D result viewer with private artifact
  downloads.

Do not describe planned behavior as implemented. Each implementation phase must
be explicitly authorized and validated before this status changes.

## 2. Product Boundary

The module generates manufacturing-oriented 3D solids from validated 2D
fabrication geometry produced by Iluminate. Its first operation is a controlled
profile sweep: a versioned vertical cross-section follows a planar path derived
from the system's millimeter-based, path-only SVG output.

This is a bounded sign-fabrication modeler, not a general-purpose CAD system.
It may grow only through explicit, deterministic operations with schemas and
fixtures. It must not become an arbitrary Python/CAD-script runner.

### Owned responsibilities

- Validate immutable SVG source artifacts and `3d-model-job.v1` recipes.
- Construct exact B-Rep solids with the approved CAD kernel.
- Apply the declared orientation, corner, cap and body-combination policies.
- Detect invalid profiles, open or disconnected paths, self-intersections,
  non-manifold results and resource-limit violations.
- Export a canonical STEP result and requested 3MF/STL derivatives.
- Produce a machine-readable manifest with hashes, units, kernel/runtime
  versions, tolerances, warnings and validation results.
- Lease, heartbeat, complete and fail its own asynchronous jobs.
- Store private tenant-scoped inputs and outputs under the approved R2 prefix.

### Explicit non-responsibilities

- Partitura, Compile, Generate, effects, playback or optical semantics.
- Controller wiring, LED strings, pixelMap, firmware or device deployment.
- Designer geometry editing or normalization.
- Animate rendering, scene media or public showroom publication.
- Slicing, supports, printer profiles, G-code or printer control.
- CNC toolpaths or proprietary machine formats.
- Authentication, role assignment or tenant resolution.
- Arbitrary user code, macros, plugins, network fetches or shell commands.

## 3. Service And Runtime Isolation

The service lives at `services/3d-worker` and runs in its own container. The
implemented initial stack is:

- Python 3.12 on a pinned Debian slim base;
- build123d as the modeling API;
- OCP/OpenCascade as the B-Rep kernel;
- Pydantic v2 for versioned input/output validation;
- Psycopg 3 for PostgreSQL job leasing;
- Boto3/S3 API for private Cloudflare R2 artifacts;
- Pytest plus deterministic geometry fixtures.

Dependencies and base-image digests must be pinned and upgraded deliberately.
OCCT/build123d license notices and redistribution obligations must be preserved.

`3d-worker` is a queue consumer, not an HTTP service. It exposes no browser or
public port and has no route in Cloudflare. PostgreSQL leases work with
`FOR UPDATE SKIP LOCKED`, bounded attempts and an expiring lease. Multiple
containers may scale horizontally against the same queue and private bucket.

The worker must not depend on `iluminate-web`, `render-worker`,
`lighting-core`, Designer or Animate being available at processing time. A job
contains immutable references and all data required to reproduce its result.

Each CAD job runs in a disposable child process with a private temporary
directory, wall-clock timeout, bounded CPU/memory and guaranteed cleanup. A
kernel crash or malformed model must fail that job without terminating the
long-lived queue consumer or exposing another tenant's artifacts.

## 4. Web And Canvas Isolation

The current Designer and Animate interfaces may not access `3d-worker`, enqueue
jobs, display its results or link to its future workspace. No 3D button, tab,
panel, action or hidden API call may be added to those interfaces.

The 3D authoring experience is a completely separate authenticated module and
canvas at `/3d-modeler`. It must not be
implemented as a Designer/Animate tab or by mounting their workspace and
changing modes.

The canvas reuses the approved interaction *scheme* of Designer where
it fits: authenticated shell, global/contextual bars, technical viewport,
metric geometry, grid, zoom/pan, selection, Layers-style hierarchy, Setup and
light/dark tokens. Profile Setup owns a persisted `Printer area` with display
units, physical width/height and snap. The grid is clipped to that physical
area, and its rulers follow the same selected display unit while persisted and
worker-facing geometry remains millimeters. This is a UI vocabulary baseline, not permission to share
mutable state, electrical tools or Designer-specific components blindly.

The 3D Layers tree is independent and belongs to the rotatable 3D assembly
workspace. `Paths` contains only materialized canonical Model Paths; its `+`
action opens the available Fabrication Plans and copies the selected plan as an
immutable snapshot. A selected Path exposes a delete action with
confirmation; deleting it also removes its persisted Sweep relations.
`Profiles` contains the saved vertical cross-sections. Root-level Profiles are
shown directly under that category without a redundant visible `Root` group.
Sweep relations remain persisted internal assembly state and do not appear as
a separate Layers collection. `Solid Objects` contains every successful
materialized job as an independent evaluation result, including multiple
results for the same Path/Profile relation. Each Solid Object eye is
independent: any number of successful results may be visible together, mesh
selection identifies one result without hiding the others, and the saved
camera survives changes to the visible set. The `Paths` and `Solid Objects`
category headers each expose one bulk visibility control. Activating it writes
one uniform visibility state to every current child; when child state is mixed,
it reveals all children. Individual child eyes remain editable afterward, so
category visibility is a reset action rather than a masking layer. Deleting one Solid Object removes
only that job and its allowlisted artifacts. Failed, queued and leased
jobs are not Solid Objects and remain technical execution state. Clicking a
Path, Profile, Profile folder or Solid Object row selects it and opens its name
as an inline text field; Enter or blur commits the name and Escape cancels.
Solid Object display names persist on their successful job, while Path,
Profile and folder names remain part of the versioned 3D document. Profile objects remain intentionally free-form. They
may remain at the root or be assigned to one user-created folder. The selected
folder receives newly drawn objects; with no selected folder, new objects are
created at the root. Objects can be reordered or dragged between root and
folders. Visibility and lock state exist at both object and folder level, with
folder state acting as a non-destructive mask over its children. The first
release does not nest folders.

The new canvas owns a separate 3D document/view model. It may import a
materialized snapshot from canonical Designer geometry, but it may not mutate
`designer.geometries`, hold a live link to a partitura, invalidate Compile or
introduce 3D fields into the partitura schema. The snapshot boundary must be
explicit, hashed and reproducible.

Both Model Paths and profile contours own an explicit connection node selected
with `Set Connection Point`. The marker is part of the independent 3D document,
not Designer geometry. For an open Model Path only either endpoint is valid; on
a closed Model Path any node may define the seam and sweep start. The profile
connection node defines the point placed on that path start. A newly imported
or created element defaults to its first node until the operator selects a
different connection point.

Vector editing follows the Designer gestures without sharing its document:
`Select` selects an unselected object on the first click and only moves an
already-selected object when dragged; `Move` remains the explicit immediate
whole-object tool. Double-clicking a visible segment with `Select` inserts a
node into any polygon or Bezier contour; a Bezier segment is split without
changing its curve. Right-button drag pans regardless of the active tool, and
left-button drag pans while `Pan` is active. The connection marker remains
smaller than normal edit nodes so the selected axis intersection stays visible.
`Setup > Printer area` persists physical width/height in millimeters plus the
operator's display unit. `Snap` is entered in that display unit and persists as
millimeters; the magnet toggle enables that configured interval and disables
quantization when off. Existing v2 documents without Printer area settings
migrate to a `220 x 220 mm` area.
Standard `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` shortcuts drive the
same Undo/Redo history as the toolbar unless focus is inside an editable field.
Background job-status polling must never replace unsaved local geometry.

`Profile` is exclusively the 2D editor for creating, editing and saving profile
geometry and its connection point. `3D` is the single assembly space: it owns
the rotatable viewport, Layers, Fabrication Plan import, Path/Profile selection,
Sweep submission, current status, generated result and downloads.

The global Profile library is a separate entry under the authenticated Auth
menu. Its records are deliberately cross-tenant lookup data managed only by
system administrators. Cards are rendered from stored vector geometry; opening
a card enters the same editor in Profile-only mode. Project-scoped
`/3d-modeler` continues to own project Model Paths, assembly orientation,
Sweep submission and generated solids. During the combined development
workspace, its Profiles panel resolves the same global catalog automatically;
selecting a catalog entry activates it for assembly and the shared Profile
editor. Saving Profile geometry updates that global record through the same
system-administrator authorization used by `/profiles/{profileId}`. The project
document keeps a revisioned geometry snapshot solely to make its Sweep input
reproducible; it does not create a second project-owned Profile.

Each Profile contour may also own bounded linear parameters. A parameter names
one X or Z axis, a fixed reference group, a control group, an optional follower
group, a derived base value and a minimum/maximum range. The base value and
movement sign are inferred from the fixed/control positions on the selected
axis; they are not separate operator inputs. Control and follower nodes receive the
same derived translation, so followers preserve dependent offsets without
distorting the measured parameter. Group membership is relative to that
parameter; one node may be driven by parameters on different axes, while two
parameters may not drive the same node on the same axis. The Profile editor
owns parameter authoring and persists definitions in the global Profile JSON.
Each internal Sweep persists its selected parameter values. Before preview,
diagnostics and job submission, the web adapter deterministically resolves a
derived contour from the immutable Profile geometry plus those values. The CAD
worker receives only that resolved contour, so it remains independent from UI
selection state and does not implement a general constraint solver.

The assembly preview is the canonical placement truth for Sweep orientation.
The ordered Path traversal defines its tangent; the Profile connection point,
authored X/Z coordinates and persisted yaw define the section frame. The web
adapter and CAD worker must preserve that exact frame. Path winding may be used
to calculate offset or containment distances, but it must never reflect the
Profile, reverse the authored traversal when clearance is zero, or infer an
inside/outside placement that differs from the preview.

The 3D workspace uses one primary operation bar and one compact contextual bar.
Profile rotation controls, Sweep parameter values and the existing contextual
delete action share that contextual row when applicable; they do not create
separate empty-height rows. Camera view controls remain attached to the
viewport because they affect only the current view.

The assembly preview keeps every Model Path on the global `Z=0` plane. Its
`Rotate Profile` is available from the assembly tool rail and exposes its
numeric contextual controls in the bar above the viewport. The redundant
assembly-information bar is absent, and viewport dragging never changes
profile rotation. Rotation is a
bounded `-180..180` degree yaw in the horizontal XY plane around the common
Path/Profile connection point, measured from the local Path `+Y` reference.
The profile remains vertical along global Z. It changes neither connection
point nor source geometry. The same persisted yaw is sent to the worker; a
preview-only orientation control is prohibited. `Flip Profile Side` adds 180
degrees to this persisted yaw so each Path can orient its lip independently.
Each persisted Path/Profile Sweep also owns `Fit clearance` in millimeters per
side (`0..5`, default `0`). It is a non-destructive derived operation: the
imported SVG/Model Path remains the acrylic master, while the worker offsets
only the receiving Sweep path. The operator explicitly selects `OUT` or `IN`
for each Sweep in the viewport toolbar beside `Compare clearance`; source,
name, containment and neighboring Paths never infer or override that choice.
The direction is persisted in the Sweep and copied unchanged into every job
recipe. Existing Sweeps without the field migrate to `OUT`. Open paths cannot
use a nonzero clearance. The web preflight rejects obvious collapsed inward
offsets; the CAD worker remains authoritative and rejects fragmented, invalid
or collapsed offset geometry with a specific `fit_clearance_*` error before
Sweep. `Compare clearance` is confined to the assembly preview and its helper
geometry is hidden whenever a generated Solid Object is visible. Paths,
Profiles and Solid Objects remain independent sibling scene groups, so their
Layers eyes continue to respond without replacing or reconstructing the other
groups.
The result camera pivots around the model's vertical center and supports a full
orbit above or below the global `Z=0` fabrication plane while preserving Z-up
as the fixed world orientation. Camera position, orbit target and zoom survive
toolbar and panel changes, scene rebuilds and temporary switches to Profile;
only an explicit standard-view or fit action resets the current view. The
integrated 3D assembly viewport renders its
fabrication grid at the exact persisted Printer area width and height and
includes that full area when fitting the camera, so model scale is visible in
relation to the available print bed. The visual bed rests at the global XY
origin by default. A dedicated transient tool may drag only that visual bed on
the global `Z=0` plane; leaving the tool resets it to the origin. This temporary
placement is neither persisted nor applied to Paths, Solid Objects, axes,
exports or Sweep input. The printer-area grid is visible by
default and can be hidden with an explicit checkbox in both the integrated and
standalone viewers. This visual boundary does not crop, translate or otherwise
mutate exported geometry. Profile and Path visibility eyes also control their
assembly-preview geometry. The former Surface mode controls are not part of the
assembly or standalone result-viewer bars.

There is no separate Create Sweep modal or visible Sweeps collection. The
operator selects one already-materialized Path and one saved Profile directly
in Layers; both appear immediately in the viewport joined at their connection
points. `Rotate Profile` uses only the bounded parameter controls around the
connection point. Rotating updates the assembly preview while retaining a
stable center derived only from the Path and does not reset the camera. `Save` persists that
assembly orientation, while `Sweep` persists if necessary and submits the
selected pair as one operator operation. Immediately before persistence, `Save`
validates every Profile contour for duplicate nodes, self-intersections and
zero-area faces. Problems open a warning dialog with two explicit outcomes:
`Correct automatically` resolves crossings with the even-odd rule, retains the
largest usable face and then saves; `Save anyway` persists the authored geometry
unchanged and warns that a later Sweep may still fail. Automatic correction
preserves the Profile identity and remaps its connection node to the nearest
surviving node.

Submission is idempotent by tenant,
project and persisted Sweep relation: an active or unchanged successful job is
reused. A changed relation or retry after failure receives a new queue row so
the last successful Solid Object and its artifacts cannot be overwritten by a
later failed attempt. While a worker execution is active, the disabled Sweep
control shows only its spinner and processing label; there is no separate job
status badge or clearance-status banner. The workspace presents retry and
downloads without exposing a technical job-history screen. Successful results
become domain-level `Solid Objects` in Layers; selecting one loads its private
mesh, its eye controls viewport visibility, and the standard contextual red
trash action deletes the selected relation's successful queue record(s) and
allowlisted R2 artifacts. Visibility and selection remain separate: the trash is disabled
until the operator explicitly selects a Solid Object in Layers or on its mesh,
and clicking the canvas background clears that selection. Queue records and
non-successful attempts remain server-side for isolation, recovery and
diagnostics.

A successful current Sweep replaces the assembly preview with the generated
model in the same 3D viewport without requiring the operator to know a
queue/job identifier. The authenticated result route remains inside the
independent 3D module and verifies tenant, project, job ownership and successful
status before returning any mesh. The integrated viewport prefers the private 3MF
artifact and falls back to STL. It supports Z-up orbit, pan, zoom, fit and
standard views, grid/axes and solid/transparent/wireframe surfaces
and the allowlisted STEP/3MF/STL/manifest downloads. It does not reuse Animate's
renderer or make an artifact public. STEP remains the canonical exact result;
the mesh viewport is an inspection surface, not a CAD authority. The standalone
authenticated result route may remain as a secondary deep link, but it is not
the primary operator flow.

An authoring document may have an empty profile canvas. Deleting a profile also
removes Sweep relations that reference it; worker execution still requires one
valid selected profile and one valid Model Path.

When web integration is separately authorized, the browser will call an
authenticated server-side adapter. That adapter derives `client_id` and user
authority from the trusted session, validates the request and enqueues a job.
The browser never connects to PostgreSQL, R2 credentials or the worker process.

## 5. Input Contract

The persisted authoring contract is `3d-model-document.v2`. External SVG
imports and Fabrication Plan snapshots both materialize the same bounded
`ModelPath` element (nodes, Bezier handles, open/closed state, provenance,
visibility and lock state). A `SweepDefinition` references exactly one
`pathId` and one `profileId`, plus bounded direction and connection settings.
The original SVG is retained as a private project Asset. The authenticated
Fabrication Plans adapter reads only the active project partitura and exposes
explicit import candidates; selecting `Import` copies one immutable snapshot
into the 3D document and creates no live Designer link. Jobs are generated from
normalized document geometry, never from mutable browser-only bytes.

The first versioned worker input remains `3d-model-job.v1`; its JSON Schema lives at
`services/3d-worker/contracts/3d-model-job.v1.schema.json` and includes:

- trusted `clientId`, project identity and an opaque job ID;
- source R2 URI, SHA-256 digest, media type and declared millimeter units;
- the originating Sweep relation identifier, selected path identifiers and an
  immutable path-only SVG snapshot;
- a profile catalog ID and explicit, bounded dimensions;
- fixed vertical orientation for planar sweeps;
- declared corner/transition, cap and body-combination policies;
- linear/angular tessellation tolerances within server-defined bounds;
- requested output formats from the supported allowlist;
- contract and engine version identifiers.

The worker accepts only the SVG subset emitted by Iluminate fabrication export:
paths, native Beziers, compound contours and explicit metric dimensions. It
rejects scripts, event handlers, external URLs, embedded files, raster images,
fonts, CSS, filters, foreign objects and unbounded document structures.

User input never selects filesystem paths, output keys, buckets, executables,
Python symbols, kernel commands or network destinations. Profile definitions
come from a controlled catalog or the bounded `custom-vector.v1` schema, never
code.

The implemented `profile_sweep` operation uses the controlled
`rectangular-channel.v1` profile with width and height bounded from 0.5 to
100 mm. It supports explicit `miter`/`round`, flat caps, separate/union body
policies and STEP-required output selections. 3MF is exported through
build123d's pinned lib3mf adapter.

The implemented `custom-vector.v1` profile allows 1 to 8 closed contours, 3 to
128 nodes per contour and 256 nodes total. Coordinates and relative Bezier
handles are bounded to +/-1000 mm. Nodes are `corner`, `straight`, `smooth` or
`symmetric`; corner and straight nodes may not carry handles. Contours use even-odd fill. Invalid, open,
self-intersecting or non-positive faces fail the job.

## 6. Geometry Rules

- Millimeters are the internal and interchange unit.
- The global frame is right-handed and fixed: Model Paths live in the
  horizontal XY plane and profiles live in a vertical XZ plane. Positive X is
  right, positive Y is up on the path canvas and positive Z is up on the
  profile canvas; negative coordinates are left or down respectively. The UI
  may store the profile's vertical coordinate in a generic `yMm` field, but it
  represents physical Z at the modeling boundary.
- The selected Model Path connection node is materialized as the first point of
  the sweep. The selected profile connection node is translated to local
  `(0, 0)` before the vertical profile plane is placed at that sweep start.
  Connection points establish placement; they do not relax validation or
  implicitly reshape either vector.
- Job SVG snapshots use a local metric document frame. Geometry is translated
  into non-negative document coordinates and the root must declare
  `viewBox="0 0 width height"` with the same metric width and height. This SVG
  serialization translation does not change the authored coordinate system or
  the connection-point relation. The recipe snapshots that local frame's
  `sourceOriginMm`; the integrated workspace applies it as the Solid Object's
  immutable global transform. Legacy recipes without the snapshot may derive
  it from the still-present source Path only as a compatibility fallback.
- The SVG/source hash and recipe hash identify a reproducible job input.
- For planar paths, the sweep uses a fixed global vertical policy; it must not
  allow uncontrolled Frenet-frame twisting. An explicit bounded profile yaw
  rotates its vertical plane only in horizontal XY around the connection point
  and is recorded in the recipe. The local Path `+Y` axis is the zero-angle
  reference and profile `+Z` always remains global up. The canonical SVG Y-axis
  reflection must preserve the assembly preview's handedness and the saved yaw
  must have the same visible direction in preview and output.
- Open paths require an explicit cap policy. Closed paths require seam checks.
- Sharp corners, minimum bend radius and profile/path self-intersection are
  validated before and after B-Rep construction.
- When a Round or Miter sweep fails with `model_sweep_failed`,
  `model_brep_invalid`, `model_envelope_invalid` or `fit_clearance_invalid`,
  the authoring UI compares the selected path's local segment lengths and turn
  angles with the connected profile's lateral reach. A compact `Errors` action
  opens the detailed diagnostic in a modal so the canvas height remains stable;
  the failed job must not reconstruct a persistent warning strip on load or
  after its Solid Object selection is deleted. Choosing `Show in 3D` marks the
  highest-risk nodes directly in the current 3D assembly view, including while
  previous Solid Objects remain visible, explains the geometric reason, and
  offers per-candidate camera focus plus a transition-appropriate corrective action. Imported
  paths use their persisted metric coordinates; no separate Path editor is
  required for this inspection.
- The assembly toolbox provides the same drag-to-measure interaction as the
  Profile tool. Because imported Model Paths are planar, assembly measurements
  intersect the cursor ray with the authored XY plane at `Z=0`, snap to Path
  nodes before the configured metric grid, and report distance plus signed X/Y
  deltas. They never create arbitrary points floating in 3D space.
- Profile authoring nodes, selected nodes, Bezier handles, connection axes and
  interaction strokes use viewport-derived sizes. Zoom changes geometry scale,
  not their usable on-screen size or hit target.
  These markers are deterministic troubleshooting candidates, not exact kernel
  attribution: OCCT may return only a general transition failure without the
  coordinate that caused it.
- A closed sweep is intersected with its signed profile envelope before B-Rep
  healing. The envelope follows the persisted profile side and the profile's
  actual horizontal extent on both sides of the Path; it does not impose a
  global inside/outside rule. This removes concave-corner overrun while still
  allowing an outer contour and an inner counter to orient their lips in
  different directions. Envelope clipping may not fragment or discard the
  intended body and any material trimming is recorded in the manifest.
- Disconnected SVG subpaths become separate candidate bodies unless an explicit
  valid union operation is requested.
- Boolean or healing operations may not silently discard bodies or features.
  When OCCT produces one positive-volume solid with a repairable topological
  defect at curved or concave sweep transitions, the worker may apply its
  deterministic shape repair once. The repaired result must preserve the body
  count, pass strict B-Rep and STEP round-trip validation, and record the
  fallback in the manifest; otherwise the job fails.
- If that repair still leaves an invalid closed planar Sweep at `0` or `180`
  degrees, a rectilinear single-contour Profile may be reconstructed from
  signed horizontal offset bands. The source Path is polygonized within the
  job's declared linear tolerance to remove exporter-invalid curve metadata;
  the result is accepted only as one positive-volume solid after B-Rep,
  STEP round-trip and mesh-manifold validation. Unsupported Profile topology
  or any failed validation remains a controlled failure.
- A successful result must contain the expected number of valid solids and
  pass B-Rep and mesh-manifold checks appropriate to each output.
- The STL compatibility export may deterministically remove exporter-emitted
  zero-area triangles, but the cleaned triangle table must still pass the full
  closed two-manifold edge check. This is mesh cleanup, not tolerance
  relaxation, B-Rep healing or permission to hide a boundary defect.
- Tolerance relaxation is never an invisible retry. The manifest records any
  permitted fallback or warning; unsafe ambiguity fails the job.

STEP is the canonical exact artifact. 3MF is the preferred print interchange
when supported by the selected exporter. STL is a compatibility derivative and
is treated as unitless mesh data whose intended unit is recorded as millimeters
in the manifest and user-facing metadata.

## 7. Persistence And Job Lifecycle

The bounded domain owns its migrations and job/repository code under
`services/3d-worker`. It must not place 3D job rules in `lighting-core` or reuse
render job tables.

`iluminate.three_d_model_documents` stores the independent bounded Model Paths,
profiles, Sweep relations and setup per tenant/project. It does not store SVG
bytes, partitura data or Designer state. Persisted v1 documents migrate in
memory to v2 with empty Model Path and Sweep collections.

`iluminate.three_d_profiles` stores the global Profile library without a
`client_id`. This intentional global lookup exception contains bounded Profile
geometry and revision metadata only, is maintained through internal
system-administrator routes, and contains no project paths or Sweep relations.

The queue table is `iluminate.three_d_model_jobs`. Its lifecycle is:

```text
queued -> leased -> processing -> succeeded
                              \-> retryable_failure -> queued
                              \-> failed
```

Jobs are immutable after leasing. A retry uses the same source/recipe hashes.
Changes require a new job. Leases have worker identity, heartbeat and expiry;
recovery must not publish partial artifacts as successful.

Database rows hold identity, tenant ownership, state, bounded diagnostics,
hashes and artifact metadata. Large SVG, STEP, 3MF, STL and verbose kernel logs
belong in private object storage or ephemeral local storage, not PostgreSQL.

## 8. R2 Storage Contract

The service reuses the existing private `CLOUDFLARE_R2_BUCKET`
(`iluminate-assets` in the current environment), endpoint, region and S3
credentials. It does not require another endpoint or public bucket.

The canonical tenant-scoped prefix is:

```text
clients/{clientId}/3d-models/{projectId}/{jobId}/
```

Expected objects are allowlisted names such as:

```text
source.svg
recipe.json
model.step
model.3mf
model.stl
manifest.json
```

Keys are built server-side from validated identifiers. Callers may not submit a
raw key. Every read, write, list, signed URL and deletion verifies the trusted
`client_id` prefix. Outputs remain private and downloads use short-lived signed
URLs. Public publication is outside this contract and must not copy artifacts
to the public render/share bucket implicitly.

Tenant deletion includes this prefix. Job/project cleanup must delete only its
resolved prefix and remain idempotent. Lifecycle/retention policy is a future
explicit decision; workers may not delete successful artifacts opportunistically.

## 9. Security Guardrails

- Authentication and authorization remain server-side web/auth concerns.
- Tenant authority is never accepted from free-form browser input.
- SQL is parameterized and every job/artifact query is tenant-scoped where
  invoked on behalf of a user.
- Secrets are environment/secret-store values and never enter recipes,
  manifests, errors, logs or generated context.
- R2 responses, SVG bodies and CAD artifacts are size-limited before parsing.
- XML parsing disables entities, external resources and network resolution.
- The worker has no inbound network exposure and should use restricted egress.
- Temporary filenames are generated internally; archive extraction is not part
  of the initial contract.
- Errors expose stable codes and bounded summaries, not stack traces, SQL,
  object credentials, local paths or raw customer geometry.
- Logs include job/tenant-safe correlation IDs but never artifact bodies.
- Results are served with download-safe content types and disposition headers.
- Kernel/runtime versions and source/output hashes are recorded for audit.

## 10. Cross-Service Guardrails

The following changes require explicit expansion beyond a normal 3D task:

- editing Designer or Animate components, routes or interaction contracts;
- changing `designer.geometries`, partitura schemas or Compile lifecycle;
- importing 3D dependencies into the Next.js browser/server image;
- placing CAD logic in `lighting-core` or `render-worker`;
- adding HTTP/public ports to the worker;
- sharing render buckets, render job tables or render-worker code;
- enabling public model publication, slicers, G-code or printer access;
- accepting arbitrary SVG, CAD scripts or third-party network imports;
- adding an ORM, broker or new object-storage service without demonstrated need.

A 3D task must preserve the existing Designer and Animate UI unless the user
separately authorizes work on the future 3D canvas. A canvas task does not
authorize worker, Compose, database or kernel changes, and a worker task does
not authorize authenticated UI changes.

## 11. Validation Contract

Documentation-only changes run the repository documentation and prompt-builder
checks. Once executable work exists, the minimum gates are:

- schema validation for valid and adversarial `3d-model-job.v1` fixtures;
- deterministic solids for line, arc, Bezier, closed-loop, multi-body and
  compound-path fixtures;
- expected rejection of uncapped/ambiguous, degenerate, self-intersecting,
  over-limit and malicious SVG inputs;
- B-Rep validity, expected solid count, bounds and volume assertions;
- STEP reopen/round-trip validation;
- 3MF/STL manifold, triangle-count/tolerance and millimeter-scale checks;
- tenant-crossing and raw-key rejection tests;
- lease expiry, retry, crash, timeout and cleanup tests;
- pinned container build, non-root runtime and Compose validation;
- proof that Designer and Animate bundles/routes remain unchanged for backend
  worker work.

Fusion 360 or SolidCraft may be used only as external reference/oracle tools in
an explicit evaluation. They are not production runtime dependencies and their
files do not override deterministic fixtures or the Iluminate contract.

## 12. Deferred Decisions

Do not decide these implicitly while implementing another task:

- additional controlled profile catalog entries and parameter ranges;
- retention periods;
- per-tenant quotas, concurrency and maximum source/mesh sizes;
- preview format and whether a derived GLB is needed;
- public sharing or manufacturing-vendor handoff;
- slicing, supports or printer integrations.

Each decision requires fixtures, failure behavior and an update to this
contract before it becomes an implemented capability.
