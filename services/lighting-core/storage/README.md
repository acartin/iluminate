# Lighting Storage

Schema and migration ownership for lighting-domain persistence. Existing
migrations define projects, controllers, partituras, deployments, device state,
assets, render artifacts/jobs and scene shares.

PostgreSQL is the persistent database. Business records are tenant-scoped by a
trusted `client_id`. The authenticated Next.js server repositories currently
implement application access with `pg` and parameterized SQL; browser code and
the public site never access PostgreSQL directly.

A project may contain multiple independent partituras. The
`projects.active_partitura_id` field selects the active one. There are no
partitura revision tables: a requested variant is another partitura record in
the same project.

The editable and generated values are stored in:

```text
iluminate.partituras.document_json
iluminate.partituras.generated_json
```

`document_json` is the only editable source of truth.
`document_json.compiledLayout` is derived by Designer `Compile`, and
`generated_json` is derived later for publication/device consumption. Neither
derived value is edited directly or used as the authoring source.

Designer objects, zones, groups, scenes and clips remain nested in the
partitura document. See `docs/partitura-lifecycle.md` for the lifecycle contract
and `services/lighting-core/migrations/` for executable storage truth.
