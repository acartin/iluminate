# Filesystem Guardrails for Iluminate

**Status:** project organization guardrails  
**Applies to:** `/srv/iluminate`  
**Purpose:** keep the monorepo understandable as services, APIs, partitura contracts, editor and simulator evolve.

---

## 1. Meaning of `services`

In this repository, `services` means a bounded product capability or functional domain.

A service may be:

- a deployable runtime,
- an API surface,
- a shared domain core,
- firmware contract notes,
- a UI application,
- a simulator,
- or a protocol boundary.

Do not assume that every directory under `services/` is a daemon.

---

## 2. Current Service Ownership

```text
services/
  web/iluminate      # Next.js UI and authoring surface
  lighting-core      # LED choreography domain and partitura model
  auth               # identity and authorization domain
  simulator          # reusable simulation domain, when it outgrows web
  device-protocol    # controller/cloud communication contracts
  firmware           # notes for the external ESP32 firmware interpreter
```

### `services/web/iluminate`

Owns:

- Next.js routes and layouts.
- React UI components.
- Canvas and timeline presentation.
- User-facing screens.
- Calls to auth and lighting APIs.

Does not own:

- authoritative partitura schema,
- authorization rules,
- project revision validation,
- controller protocol rules,
- firmware-specific LED drivers.

### `services/lighting-core`

Owns:

- chains,
- segments,
- zones,
- partituras,
- scenes,
- tracks,
- clips,
- effect contracts,
- partitura validation,
- project revisions,
- deployment payload rules,
- LED-domain API handlers if needed.

Does not own:

- login,
- password recovery,
- session cookies,
- organization billing,
- React component state,
- ESP32 hardware drivers.

### `services/auth`

Owns:

- users,
- organizations,
- memberships,
- roles,
- permissions,
- sessions/tokens,
- invitations,
- password recovery,
- auth audit.

Does not own:

- LED project structure,
- partituras,
- controller state,
- deployment rules,
- simulator behavior.

### `services/simulator`

Owns reusable simulation logic after it becomes independent from the first web prototype.

The simulator must interpret the same partitura semantics as firmware. It should not introduce a second authoring model.

### `services/device-protocol`

Owns communication contracts between cloud services and controllers:

- provisioning payloads,
- desired state,
- reported state,
- command revisions,
- firmware/core version checks,
- polling or transport contracts.

### `services/firmware`

Owns only notes and contracts needed by the external ESP32 firmware interpreter.

The compiled firmware source, Arduino/PlatformIO/ESP-IDF project, build scripts and hardware drivers live outside this monorepo. Do not add ESP32 build targets here unless the repository boundary is intentionally changed.

---

## 3. Dependency Direction

Preferred direction:

```text
web/iluminate
  -> auth/contracts
  -> lighting-core/contracts
  -> lighting-core/schemas

lighting-core/api
  -> lighting-core/domain
  -> lighting-core/validators
  -> lighting-core/storage
  -> auth/contracts, when identity context is needed

simulator
  -> lighting-core/domain
  -> lighting-core/schemas

device-protocol
  -> lighting-core/contracts, only for exported partitura/deployment shapes

external firmware environment
  -> documented partitura schema/contracts
```

Avoid:

- `lighting-core` importing React or Next.js.
- `auth` importing lighting domain internals.
- `web/iluminate` becoming the source of truth for partituras.
- API handlers duplicating validation rules that belong in `validators/`.
- simulator storing its own incompatible partitura format.

---

## 4. Domain Vocabulary Is Stable

Use the same names in UI, API, JSON, validators and the external firmware interpreter:

- `chain`
- `segment`
- `zone`
- `partitura`
- `scene`
- `track`
- `clip`
- `effect`
- `controller`
- `deployment`

`partitura` is the official domain term. Do not use `score` as a synonym in UI, API, JSON, code or documentation.

Do not rename these concepts casually. If a rename is proposed, document the concrete problem it solves before changing code.

---

## 5. Partitura Guardrails

The partitura is not:

- a Konva document,
- a timeline library dump,
- arbitrary C/C++ code,
- firmware source,
- a video format,
- a WLED preset clone.

The partitura is a declarative, versioned domain document that can be validated, simulated, exported and executed by a universal firmware core.

Within this repo, controller hardware is represented only as three logical chain outputs: `1`, `2` and `3`. Board pins, LED driver libraries and build toolchains are external firmware concerns.

Canvas, timeline and simulator data may add view metadata, but must not replace the partitura model.

---

## 6. API Placement

APIs live inside the service that owns the domain.

Examples:

- auth API belongs under `services/auth/api`.
- lighting/project/revision/deployment API belongs under `services/lighting-core/api`.
- UI-only Next route handlers may live under `services/web/iluminate/app/api` only when they are presentation adapters or temporary placeholders.

If a Next API route starts owning domain rules, move the rule to the owning service and let the route call it.

---

## 7. Storage Placement

Each service owns its storage adapters and migrations.

No service should directly read or write another service's tables. Cross-service communication should happen through contracts, APIs, or explicit repository boundaries.

PostgreSQL is the target database for persistent platform state.

The system is multitenant by design. The canonical PostgreSQL/backend tenant field is `client_id`, aligned with the auth model copied from `datasyncsa`. Tenant ownership must be resolved by trusted backend/auth or device identity context, not by free-form frontend input.

Expected ownership:

- `auth/storage`: users, organizations, memberships, roles, sessions.
- `lighting-core/storage`: projects, controllers, revisions, deployments, device commands, device status, assets metadata.

---

## 8. Firmware Boundary

Firmware receives validated partitura/deployment artifacts. It must not receive arbitrary code generated by the web or AI.

The firmware implementation itself is out of repo. This monorepo defines the partitura and deployment contracts that the external ESP32 environment consumes.

Firmware changes are for:

- new effects,
- new drivers/protocols,
- new sensors or input types,
- new blend modes,
- core player changes,
- bug fixes.

Changing color, timing, segment ranges, zones or scenes should be a partitura update, not a firmware update.

---

## 9. AI Usage Boundary

AI may assist with:

- proposing zones,
- suggesting chain paths,
- generating first-pass scenes,
- recommending effect parameters,
- detecting inconsistencies,
- producing diagrams or documentation.

AI output must pass through deterministic schemas and validators. AI must not create per-project firmware or bypass the partitura model.

---

## 10. When Adding New Files

Before creating a file, decide:

1. Which service owns this responsibility?
2. Is it domain logic, API, storage, UI, contract, fixture, or test?
3. Will another service need to consume it?
4. Does it duplicate an existing concept from the product document?

If the answer is unclear, prefer a README/TODO placeholder over premature implementation.

---

## 11. MVP Bias

The MVP is a vertical LED choreography proof, not a full SaaS platform.

Prioritize:

1. partitura model,
2. validation,
3. canvas authoring,
4. timeline,
5. simulator,
6. ESP32 execution,
7. deployment and scene activation.

Defer:

- billing,
- marketplace,
- multiuser realtime collaboration,
- mobile app,
- photorealistic simulation,
- MQTT requirement,
- multi-controller synchronization.
