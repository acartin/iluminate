# Iluminate 3D worker

This directory owns the isolated SVG-to-solid queue worker. Its authoritative
architecture and security boundary are defined in
`.agent/THREE_D_WORKER_CONTRACT.md`.

The service consumes asynchronous tenant-scoped PostgreSQL jobs and transforms
validated millimeter-based SVG fabrication paths plus a versioned profile
recipe into STEP, 3MF and STL artifacts in the private assets bucket.

The bounded `profile_sweep` operation supports `fitClearanceMm` per side on
closed receiving paths. The trusted web adapter copies the operator-selected
`fitClearanceDirection` from the persisted Sweep recipe; it does not infer
relationships between arbitrary Paths. The worker rejects open, fragmented,
invalid or collapsed offsets before Sweep and never mutates the source SVG.

It runs in its own container as a non-HTTP queue consumer. It must remain
independent from `lighting-core`, `render-worker`, Designer and Animate. The
current Designer and Animate interfaces must not expose or invoke it. The
separate authenticated 3D Modeler canvas owns its own state and routes under
`/3d-modeler`.

Before changing executable files, read:

- `.agent/RULES.md`
- `.agent/THREE_D_WORKER_CONTRACT.md`
- `.agent/FILESYSTEM_GUARDRAILS.md`
- `.agent/EXECUTION_MAP.md`

The runtime stack is Python 3.12, build123d/OCP, Pydantic, Psycopg and Boto3.
Dependencies and the base image are pinned. Jobs run in disposable child
processes with time, address-space, file-size and descriptor limits.

## Queue and storage

The bounded module owns `iluminate.three_d_model_jobs` and
`iluminate.three_d_model_documents`, created by:

```text
services/3d-worker/migrations/2026-11-02_create_3d_model_jobs.sql
```

The worker itself does not expose an HTTP API. The separately authorized web
adapter under `/api/3d-modeler` derives `client_id` from the trusted session,
allocates the job ID, uploads the immutable `source.svg`, calculates both
checksums and inserts the queue row. Raw object keys are not accepted by the
worker contract.

Artifacts use only this private prefix:

```text
clients/{clientId}/3d-models/{projectId}/{jobId}/
```

`manifest.json` is uploaded last and the database becomes `succeeded` only
after all artifacts are private in R2.

## Validation

```bash
docker build --target test -f services/3d-worker/Dockerfile -t iluminate-3d-worker:test .
docker run --rm iluminate-3d-worker:test
docker compose config
```

The Compose service has no port and is not attached to the normal application
network. Its dedicated network reaches PostgreSQL; R2 remains an outbound S3
dependency. The healthcheck verifies PostgreSQL connectivity without exposing
an inbound endpoint.
