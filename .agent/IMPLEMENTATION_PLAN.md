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

---

## Phase 0: Partitura Hardware Boundary

**Objective:** lock the hardware abstraction used by the repo without moving firmware build work into the repo.

### Deliverables

- [x] Treat ESP32 firmware implementation as external to this repo.
- [x] Limit repo hardware modeling to three logical chain outputs: `1`, `2` and `3`.
- [x] Document the `chain.output` contract in `services/lighting-core`.
- [x] Document that board pins map to outputs in the external firmware project, not in this repo.
- [ ] Document power input, protection and wiring assumptions as non-authoritative notes if useful for users.
- [x] Document LED protocol only as an external firmware note when it matters for compatibility.
- [x] Keep physical LED counts, pin maps and brightness outside application environment variables.
- [ ] Measure realistic FPS by chain length in the external firmware environment when needed.
- [ ] Document firmware framework only as an external environment note when known.

### Exit Criteria

- [ ] `lighting-core` can validate that chains use only outputs `1`, `2` and `3`.
- [ ] The repo does not contain ESP32 firmware source or build scripts.
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
- [ ] Keep firmware source, build scripts and hardware drivers outside this repo.
- [x] Capture compatibility notes in `services/firmware/README.md` without adding a firmware project.
- [x] Add a WS2812B-like web/core simulator before firmware implementation.

### Exit Criteria

- [ ] An external ESP32 firmware build can load a fixture produced by this repo.
- [ ] Changing timing/colors/zones requires partitura update only, not firmware rebuild.
- [ ] This repo remains the producer/validator of partitura artifacts, not the firmware source tree.

---

## Phase 3: Technical Web Editor

**Objective:** let a professional model a physical LED installation from the browser.

### Deliverables

- [ ] Align `services/web/iluminate` navigation with Iluminate domain.
- [ ] Add Projects placeholder.
- [ ] Add Project Editor route.
- [ ] Add image/render/plan upload placeholder.
- [ ] Add canvas area.
- [ ] Add scale calibration tool.
- [ ] Add rulers/grid.
- [ ] Draw up to three chains.
- [ ] Show data direction.
- [ ] Represent wire jumps without LEDs.
- [ ] Calculate LED points by density/length.
- [ ] Show LED indices.
- [ ] Create segments from ranges.
- [ ] Create zones from segments.
- [ ] Export partitura through `lighting-core`.

### Exit Criteria

- [ ] A user can model a small sign with chains, segments and zones.
- [ ] The web editor stores domain data outside any private Konva format.
- [ ] Exported partitura passes `lighting-core` validation.

---

## Phase 4: Timeline and Simulator

**Objective:** let the user author, preview and approve a coordinated lighting narrative.

### Deliverables

- [ ] Add scenes.
- [ ] Add tracks targeting zones.
- [ ] Add clips to tracks.
- [ ] Move clips in time.
- [ ] Resize clip duration.
- [ ] Edit effect parameters.
- [ ] Add scene loop.
- [ ] Add playback head.
- [ ] Simulate LEDs over the uploaded image.
- [ ] Support layers minimally.
- [ ] Support at least `replace` blend.
- [ ] Add deterministic simulator fixtures.
- [ ] Compare web simulator output against expected effect cases.

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
- [ ] Define desired partitura revision.
- [ ] Define desired scene command.
- [ ] Define reported device status.
- [ ] Implement controller polling contract.
- [ ] Store active and previous partitura on device.
- [ ] Validate checksum before activation.
- [ ] Apply partitura revision.
- [ ] Activate scene without full partitura change.
- [ ] Report applied command revision.
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
