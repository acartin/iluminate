# Iluminate Implementation Plan

**Status:** living execution plan  
**Purpose:** track progress toward the full Iluminate platform without losing the vertical proof goal.  
**Rule:** update this document whenever a phase is completed, materially changed, or split.

---

## Guiding Goal

An ally can design a segmented LED installation, author and simulate a partitura, publish it remotely, and have an ESP32 controller execute it without recompiling firmware.

The product is not complete until this loop works:

```text
physical installation model
→ partitura authoring
→ simulation
→ validation
→ deployment
→ ESP32 execution
→ reported status
→ rollback or scene change
```

## Current Product Direction Snapshot

The near-term focus is no longer firmware parity or over-polishing individual effects. The priority is to make the web simulator and composer concepts convincing.

Current product direction:

```text
SVG/canvas of real sign
-> zones such as letters, words, logo and full_sign
-> continuous LED routes drawn by the operator
-> sampled real LED points using one project LED density
-> generated pixelMap
-> spatial/linear effects
```

The hidden mega matrix is useful as an internal coordinate field for effects, but the operator should not be forced to see or manage it. Matrix presets remain useful only inside `Effect Lab`.

See `.agent/PIXELMAP_COMPOSER_DIRECTION.md` before redesigning the composer, pixelMap model, effect scope, or UI workflow.

---

## Phase 0: Partitura Hardware Boundary

**Objective:** lock the hardware abstraction used by the repo while keeping production firmware work in an external repository.

### Deliverables

- [x] Treat organized ESP32 firmware implementation as external to this repo.
- [x] Limit repo hardware modeling to three logical chain outputs: `1`, `2` and `3`.
- [x] Document the `chain.output` contract in `services/lighting-core`.
- [x] Document that board pins map to outputs in the external firmware project, not in this repo.
- [ ] Document power input, protection and wiring assumptions as non-authoritative notes if useful for users.
- [x] Document LED protocol only as an external firmware note when it matters for compatibility.
- [x] Keep physical LED counts, pin maps and brightness outside application environment variables.
- [ ] Measure realistic FPS by chain length in the external firmware environment when needed.
- [x] Document firmware framework and local flashing flow as external environment notes.

### Exit Criteria

- [ ] `lighting-core` can validate that chains use only outputs `1`, `2` and `3`.
- [x] The repo contains only temporary firmware spikes; organized PlatformIO firmware lives in a separate repo.
- [ ] The partitura model stays independent from concrete ESP32 pins, FastLED arrays and brightness constants.

---

## Phase 1: Lighting Core Domain

**Objective:** create the canonical partitura model before the UI owns any domain rules.

### Deliverables

- [x] Define TypeScript domain types under `services/lighting-core`.
- [x] Define versioned partitura schema.
- [x] Model `chain` with `output` constrained to `1`, `2` or `3`.
- [x] Model `segment`.
- [x] Model `zone`.
- [x] Model `scene`.
- [x] Model `track`.
- [x] Model `clip`.
- [x] Model `effect` contract/metadata.
- [x] Add fixtures for small deterministic installations.
- [x] Validate missing references.
- [x] Validate segment ranges outside chains.
- [x] Validate overlapping segment ranges.
- [x] Validate empty zones.
- [x] Validate unsupported effects.
- [x] Validate required core version.
- [x] Export readable JSON partitura.

### Exit Criteria

- [x] A hand-written partitura validates successfully.
- [x] Invalid fixtures produce deterministic, human-readable validation errors.
- [x] `services/web/iluminate` can consume types/contracts without owning the model.

---

## Phase 2: External Firmware Compatibility

**Objective:** prove that an external ESP32 firmware environment can execute a validated partitura produced by this repo.

### Deliverables

- [x] Export a validated JSON partitura fixture from `services/lighting-core`.
- [x] Document how the external firmware should consume `chain.output` values 1, 2 and 3.
- [x] Document supported effect identifiers and parameters as contracts.
- [x] Keep organized firmware source, build scripts and hardware drivers outside this repo.
- [x] Capture compatibility notes in `services/firmware/README.md`; keep monorepo firmware code limited to temporary spikes.
- [x] Add a WS2812B-like web/core simulator before firmware implementation.
- [x] Create an external PlatformIO firmware repo for the ESP32 runtime path.
- [x] Validate local Windows build/upload/serial monitor flow with PlatformIO.
- [x] Document the partitura lifecycle in `docs/partitura-lifecycle.md`.

### Exit Criteria

- [x] An external ESP32 firmware build can load an embedded `partitura.v1` fixture derived from this repo.
- [ ] Changing timing/colors/zones requires partitura update only, not firmware rebuild.
- [x] This repo remains the producer/validator of partitura artifacts; organized firmware source lives in the external PlatformIO repo.

---

## Phase 3: Technical Web Editor

**Objective:** let a professional model a real sign from SVG/canvas, zones and continuous LED routes.

### Deliverables

- [ ] Align `services/web/iluminate` navigation with Iluminate domain.
- [ ] Add Projects placeholder.
- [ ] Add Project Editor route.
- [ ] Add SVG/render/plan upload placeholder.
- [ ] Add real sign canvas area.
- [ ] Add scale calibration tool in cm/mm.
- [ ] Add one project-level LED density setting.
- [ ] Warn and reset routes/cabling when LED density changes.
- [ ] Add zone drawing tools: rectangle, circle and polygon.
- [ ] Allow zones such as letters, words, logo, background and full sign.
- [ ] Store zone geometry and bounds in the editable document.
- [ ] Add optional rulers/grid/snap guides only as routing aids.
- [ ] Draw continuous directional LED routes over the canvas.
- [ ] Assign each route to logical output `1`, `2` or `3`.
- [ ] Sample route points using project LED density.
- [ ] Generate serial LED indices from route order.
- [ ] Show LED points and indices during route editing.
- [ ] Represent non-LED jumpers/continuations between route portions.
- [ ] Calculate zone membership for each sampled LED.
- [ ] Generate `pixelMap` from routed real LED points.
- [ ] Keep raw `pixelMap` hidden from normal operators.
- [ ] Export partitura through `lighting-core`.

### Exit Criteria

- [ ] A user can upload or trace a sign, define zones and draw continuous LED routes.
- [ ] The web editor stores domain data outside any private Konva format.
- [ ] Exported partitura passes `lighting-core` validation.

---

## Phase 4: Timeline and Simulator

**Objective:** let the user author, preview and approve a coordinated lighting narrative.

### Deliverables

- [x] Add scenes.
- [x] Add clips targeting zones.
- [x] Edit effect parameters from effect metadata.
- [x] Add scene loop.
- [x] Add modal player with play/pause/stop.
- [x] Add `Effect Lab` for controlled matrix and sign-like templates.
- [x] Support initial apply modes: whole sign, each element, sequential elements.
- [x] Support layers minimally.
- [x] Support at least `replace` blend.
- [ ] Move clips in time with a timeline UI.
- [ ] Resize clip duration with a timeline UI.
- [ ] Add playback head in scene timeline.
- [ ] Simulate LEDs over the uploaded SVG/image.
- [ ] Formalize effect coordinate space: global, zone-local and grouped/sequential.
- [ ] Add deterministic simulator fixtures.
- [ ] Compare web simulator output against expected effect cases.
- [ ] Improve effect library enough for convincing demos before prioritizing firmware parity.

### Exit Criteria

- [ ] A user can create a short scene and preview it.
- [ ] Simulation uses the same partitura semantics as firmware.
- [ ] At least the initial five effects have deterministic reference cases.

---

## Phase 5: Deployment and Device Protocol

**Objective:** publish partituras and scene changes remotely while the device remains autonomous.

### Deliverables

- [ ] Define device identity contract.
- [ ] Define provisioning placeholder.
- [ ] Define desired partitura id/checksum.
- [ ] Define desired scene command.
- [ ] Define reported device status.
- [ ] Implement controller polling contract.
- [ ] Store active and previous partitura on device.
- [ ] Validate checksum before activation.
- [ ] Apply partitura artifact.
- [ ] Activate scene without full partitura change.
- [ ] Report applied command sequence.
- [ ] Implement rollback path.

### Exit Criteria

- [ ] Server can publish a new partitura.
- [ ] Controller applies it without firmware rebuild.
- [ ] Server can change active scene.
- [ ] Web distinguishes desired state from reported state.
- [ ] Failed partitura activation can roll back.

---

## Phase 6: Auth and B2B Product Layer

**Objective:** turn the vertical proof into a multi-organization platform.

**Database decision:** PostgreSQL is the target relational database. Multitenancy is deferred as a product phase, but every persistent business table designed before this phase must already include `client_id`, aligned with the copied auth model.

### Deliverables

- [ ] Implement `services/auth` domain.
- [ ] Add organizations.
- [x] Define `client_id` as the canonical tenant/customer identifier naming convention.
- [ ] Add users.
- [ ] Add organization memberships.
- [ ] Add roles and permissions.
- [ ] Add sessions/tokens.
- [ ] Move placeholder auth out of web.
- [ ] Scope projects by organization.
- [ ] Scope controllers by organization/project.
- [ ] Track revision author.
- [ ] Add deployment audit records.
- [ ] Add ally/operator/client permission model.

### Exit Criteria

- [ ] Users authenticate through auth service.
- [ ] Lighting APIs receive resolved identity context.
- [ ] No frontend-provided organization/role is authoritative.
- [ ] Project and controller data are isolated by organization.
- [ ] Database constraints and queries prevent cross-tenant reads/writes.

---

## Phase 7: AI Assistance

**Objective:** use AI as an internal accelerator without bypassing deterministic validation.

### Deliverables

- [ ] Suggest zones from image/render.
- [ ] Suggest chain routes.
- [ ] Generate a first-pass scene from user intent.
- [ ] Recommend effects and parameters.
- [ ] Generate seasonal variants.
- [ ] Detect common inconsistencies.
- [ ] Generate installation notes or bill-of-material hints.
- [ ] Ensure all AI outputs pass `lighting-core` validators.

### Exit Criteria

- [ ] AI proposals are editable drafts, not authoritative output.
- [ ] AI cannot generate per-project firmware.
- [ ] AI cannot bypass partitura schema validation.

---

## Cross-Cutting Work

### Documentation

- [ ] Keep `.agent/RULES.md` aligned with architecture.
- [ ] Keep `.agent/FILESYSTEM_GUARDRAILS.md` aligned with services.
- [ ] Keep `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md` aligned with product decisions.
- [ ] Regenerate `.agent/BRAIN_MAP.md` and `.agent/AI_CONTEXT_PACK.md` after major structure changes.

### Validation

- [ ] Define validation commands per service as runtimes appear.
- [ ] Add fixtures before adding complex editor behavior.
- [ ] Turn every real installation failure into a validator, guardrail, template or diagnostic.

### Naming

- [ ] Use `Iluminate` as official product name.
- [ ] Use `partitura` as official domain term.
- [ ] Do not introduce `score` as a synonym.
