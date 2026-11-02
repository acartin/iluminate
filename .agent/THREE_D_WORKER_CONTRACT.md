# Iluminate 3D Worker Contract

**Status:** approved target architecture; runtime and UI are not implemented.
**Last reviewed:** 2026-11-02.
**Purpose:** define ownership, isolation, security and artifact rules for the
bounded SVG-to-3D modeling capability before executable code is introduced.

## 1. Current State

`3d-worker` is an authorized future service. At the time of this contract:

- `services/3d-worker/README.md` is a documentation-only service scaffold;
- there is no worker image, Compose service, queue table, API or web route;
- Designer and Animate do not expose, invoke or navigate to 3D modeling;
- no existing workflow may be changed merely to prepare for this module.

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

When implemented, the service lives at `services/3d-worker` and runs in its own
container. The approved initial stack is:

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

The future 3D authoring experience will be a completely separate authenticated
module and canvas. Its exact route is intentionally undecided. It must not be
implemented as a Designer/Animate tab or by mounting their workspace and
changing modes.

The new canvas should reuse the approved interaction *scheme* of Designer where
it fits: authenticated shell, global/contextual bars, technical viewport,
millimeter units, grid, zoom/pan, selection, Layers-style hierarchy, Setup and
light/dark tokens. This is a UI vocabulary baseline, not permission to share
mutable state, electrical tools or Designer-specific components blindly.

The new canvas owns a separate 3D document/view model. It may import a
materialized snapshot from canonical Designer geometry, but it may not mutate
`designer.geometries`, hold a live link to a partitura, invalidate Compile or
introduce 3D fields into the partitura schema. The snapshot boundary must be
explicit, hashed and reproducible.

When web integration is separately authorized, the browser will call an
authenticated server-side adapter. That adapter derives `client_id` and user
authority from the trusted session, validates the request and enqueues a job.
The browser never connects to PostgreSQL, R2 credentials or the worker process.

## 5. Input Contract

The first versioned input is `3d-model-job.v1`. The exact schema will be added
with the runtime, but it must include at least:

- trusted `clientId`, project identity and an opaque job ID;
- source R2 URI, SHA-256 digest, media type and declared millimeter units;
- selected path identifiers or an immutable path-only SVG snapshot;
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
come from a controlled catalog or from a future bounded schema, never code.

## 6. Geometry Rules

- Millimeters are the internal and interchange unit.
- The SVG/source hash and recipe hash identify a reproducible job input.
- For planar paths, the sweep uses a fixed global vertical/binormal policy; it
  must not allow uncontrolled Frenet-frame twisting.
- Open paths require an explicit cap policy. Closed paths require seam checks.
- Sharp corners, minimum bend radius and profile/path self-intersection are
  validated before and after B-Rep construction.
- Disconnected SVG subpaths become separate candidate bodies unless an explicit
  valid union operation is requested.
- Boolean or healing operations may not silently discard bodies or features.
- A successful result must contain the expected number of valid solids and
  pass B-Rep and mesh-manifold checks appropriate to each output.
- Tolerance relaxation is never an invisible retry. The manifest records any
  permitted fallback or warning; unsafe ambiguity fails the job.

STEP is the canonical exact artifact. 3MF is the preferred print interchange
when supported by the selected exporter. STL is a compatibility derivative and
is treated as unitless mesh data whose intended unit is recorded as millimeters
in the manifest and user-facing metadata.

## 7. Persistence And Job Lifecycle

The bounded domain owns its future migrations and job/repository code under
`services/3d-worker`. It must not place 3D job rules in `lighting-core` or reuse
render job tables.

The target lifecycle is:

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
- expected rejection of open, disconnected, self-intersecting, over-limit and
  malicious SVG inputs;
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

- exact route and navigation label of the future 3D canvas;
- first controlled profile catalog and parameter ranges;
- queue table names and retention periods;
- per-tenant quotas, concurrency and maximum source/mesh sizes;
- 3MF exporter choice if the initial kernel adapter cannot provide it safely;
- preview format and whether a derived GLB is needed;
- public sharing or manufacturing-vendor handoff;
- slicing, supports or printer integrations.

Each decision requires fixtures, failure behavior and an update to this
contract before it becomes an implemented capability.
