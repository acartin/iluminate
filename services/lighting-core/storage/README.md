# Lighting Storage

Persistence adapters and repositories for lighting-owned tables.

Expected future tables include projects, controllers, partituras, deployments, device commands, device status and assets metadata.

A project has one current partitura. Persistence should not create partitura revision tables or revision-numbered JSON artifacts; when a user wants a variant, the application should duplicate the partitura as a separate record.

PostgreSQL is the target database. All persistent lighting business records must include `client_id` from the first schema design, matching the copied auth model.

The current editable partitura is stored as JSON:

```text
iluminate.partituras.document_json
```

The current firmware-facing generated artifact is stored as JSON:

```text
iluminate.partituras.generated_json
```

`document_json` is the only editable source of truth. `document_json.compiledLayout` is derived by the Designer `Compile` action, and `generated_json` is derived later for firmware download. Neither derived value should be edited directly or treated as the source for UI authoring.

Designer objects, zones, groups, scenes and clips remain nested inside the partitura document at this stage. See `docs/partitura-lifecycle.md`.
