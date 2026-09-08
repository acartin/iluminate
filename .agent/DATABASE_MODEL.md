# Iluminate Database Model

**Status:** initial operational model  
**Database:** PostgreSQL  
**Tenant convention:** `client_id`  
**Auth source:** copied `auth_clients` model from `datasyncsa`

## Principle

Iluminate is a multitenant partitura production system. Every persistent business table must be scoped by `client_id` unless it is a global lookup or a deliberately cross-client audit/system table.

The `auth_*` tables live in `public` for now because they were copied from the existing auth model. Iluminate-owned operational tables live in the `iluminate` schema.

## Schemas

- `public`: copied auth model.
- `iluminate`: projects, controllers, current partituras, deployments, device communication, assets and audit.

## Auth Tables

### `public.auth_clients`

Canonical tenant/client table. Every Iluminate project, controller, partitura and deployment belongs to one `auth_clients.id` through `client_id`.

### `public.auth_users`

Platform user accounts. Used as partitura authors, deployment requesters and audit actors.

### `public.auth_roles`

Role catalog. Initial roles are `system-admin`, `system-user`, `client-admin` and `client-viewer`.

### `public.auth_user_roles`

Many-to-many relation between users and roles.

### `public.auth_user_clients`

Many-to-many relation between users and clients. This is how a user receives access to a tenant.

### `public.auth_sessions`

Session records for bearer token auth when the backend auth API is enabled.

### `public.auth_password_reset_tokens`

Password recovery tokens.

### `public.auth_audit_log`

Auth-specific audit log copied from the auth baseline.

## Iluminate Tables

### `iluminate.projects`

Represents a client-owned LED sign, stand, exhibit or installation. It is the top-level workspace for modeling the physical layout, assets, controllers and current partitura.

Primary use:

- group the work for one sign or installation;
- scope all records by `client_id`;
- connect editor assets, controllers and the current partitura.

### `iluminate.controllers`

Represents one ESP32 controller registered for a client and optionally attached to a project.

Primary use:

- identify a physical controller;
- track desired and active partituras;
- track lifecycle status and last seen time;
- provide the target for deployments and device commands.

The controller record only describes the device that will consume partituras. Organized ESP32 firmware lives in the external PlatformIO repo documented in `docs/partitura-lifecycle.md`.

### `iluminate.partituras`

Stores the current editable partitura document and the latest generated firmware-facing artifact for a project.

Primary use:

- persist the web authoring document in `document_json`;
- persist the latest validated firmware-facing artifact in `generated_json`;
- keep validation results in `validation_report`;
- provide the artifact that controllers download and interpret;
- enforce one current partitura per project.

Iluminate does not model partitura revisions. When a user wants a variant, the application duplicates the partitura as a separate record. The partitura JSON remains declarative. It must not contain firmware code, physical pin maps, credentials or FastLED array names.

Current direction for `document_json`:

- project construction settings;
- one project-level addressable pixel density, for example `60 Pixels/m`;
- one project-level physical emitter density, for example `60 LEDs/m`;
- uploaded SVG/render references by asset id or storage URI;
- zones/geometries such as letters, words, logo, background and full sign;
- continuous directional LED routes drawn over the sign canvas;
- scene/effect authoring state.

Important rule:

```text
One project uses one LED density.
Changing LED density resets existing LED routes/cabling.
```

Current direction for `generated_json`:

- validated `partitura.v1`;
- chains/logical outputs;
- segments derived from routes;
- zones;
- scenes/tracks/clips;
- generated `pixelMap`.

`pixelMap` is generated georeferencing data. It maps physical serial LEDs to visual coordinates:

```text
output/index -> x/y -> segment/zone memberships -> effect sampling
```

Operators should not normally edit raw `pixelMap`. They edit zones and continuous LED routes; the system regenerates the map.

### `iluminate.deployments`

Records publication attempts from a partitura artifact to a controller.

Primary use:

- distinguish "partitura exists" from "partitura was sent to this controller";
- track pending, downloaded, applied, failed and rollback states;
- audit who requested the publication.

### `iluminate.device_commands`

Queues lightweight commands for a controller.

Primary use:

- request scene changes without a full partitura update;
- ask the controller to refresh desired state;
- trigger rollback, restart or identify behavior;
- track command sequence and processing state.

### `iluminate.device_status_reports`

Stores reports sent by controllers.

Primary use:

- know which partitura is actually active on the ESP32;
- know the active scene reported by the device;
- capture firmware version, IP and health payload;
- distinguish desired state from reported state.

### `iluminate.assets`

Stores metadata for project files used by the editor.

Primary use:

- reference photos, renders, plans, SVGs and other files;
- keep storage URI and metadata;
- connect visual editor inputs to a project without embedding files in PostgreSQL.

### `iluminate.audit_events`

Append-only operational audit trail.

Primary use:

- record important actions across projects, partituras, deployments and device operations;
- preserve actor, entity, action and metadata;
- support future B2B traceability.

## Initial Migration

The initial operational migration is:

```text
services/lighting-core/migrations/2026-08-19_create_iluminate_operational_tables.sql
```

The current partitura persistence migration is:

```text
services/lighting-core/migrations/2026-08-22_create_iluminate_partituras.sql
```

Revision tables were removed by:

```text
services/lighting-core/migrations/2026-08-22_remove_partitura_revisions.sql
```

See also:

```text
docs/partitura-lifecycle.md
```

Validation command:

```text
set -a; source .env; set +a; docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < services/lighting-core/migrations/2026-08-19_create_iluminate_operational_tables.sql
```
