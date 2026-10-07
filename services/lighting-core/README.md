# Lighting Core Service

Functional domain for choreographed addressable LED installations.

This service owns:

- chains
- zones
- visual groups
- generated pixel maps
- scenes
- tracks
- clips
- effects catalog contracts
- partitura schemas and validation
- multiple independently editable partituras per project, with one active deployment target
- controller-facing deployment payloads
- deterministic simulator contracts

It may contain an API under `api/`, pure domain logic under `domain/`, schemas under `schemas/`, persistence under `storage/`, and shared fixtures under `fixtures/`.

Persistent records owned by lighting-core are multitenant by design. Projects, controllers, partituras, deployments, device commands and status records must be scoped by the trusted `client_id` context provided by auth or device identity.

Iluminate does not model partitura revisions or version history. Duplicating a
partitura creates a separate record; a project selects one active partitura for
deployment.

## Effect Targeting Boundary

Physical wiring establishes each pixel's output and serial order. A generated
pixel map adds its spatial position. Effects normally target visual zones or
named groups, not manually authored logical LED segments. Effects then evaluate
the selected pixels in serial, local, or global coordinates. See
`.agent/EFFECT_TARGETING_MODEL.md` for the canonical definition.

It must not own login, password, sessions, billing, or web component state.

## Hardware Boundary

Partituras model controller chains through logical `chain.output` values only:

- `1`
- `2`
- `3`

The current external ESP32 firmware reference maps those outputs to concrete arrays and pins, but that mapping is documented only as a firmware note in `services/firmware/README.md`.

Lighting-core validators should treat outputs outside `1`, `2` and `3` as invalid. Concrete ESP32 pins, FastLED arrays, LED protocol, brightness and driver setup remain outside the partitura abstraction.

## Current Package Surface

The TypeScript package exports:

- `generatePartitura`: builds a normalized `partitura.v2` document from a configuration command.
- `validatePartitura`: returns deterministic, human-readable validation issues.
- `effectCatalog`: declares the first supported compiled-core effect identifiers.
- `preparePartituraRuntime`, `createFrameBuffer` and `renderFrameInto`: compile
  lookup tables once and render deterministic RGB frames into caller-owned
  typed arrays without steady-state allocations.
- `renderSceneFrame`: compatibility convenience for non-realtime callers.
- `simulateWs2812bFrame`: WS2812B-like output simulator with per-output buffers, GRB transport order and estimated refresh timing.
- `VisualSceneV1` and `PlayerBundleManifestV1`: immutable browser/video render
  contracts kept separate from firmware data.

Supported effect identifiers are declared by `effectCatalog`; fixture and
runtime validation reject unknown effects.

Fixtures live in `fixtures/` and are intended to be reused by the web simulator and the external firmware interpreter.

## WS2812B-Like Simulation Scope

The simulator models the operational behavior useful for Iluminate:

- serial LED order per logical output;
- 8-bit RGB color quantization;
- WS2812B transport order as GRB bytes;
- 24 bits per pixel;
- nominal 1.25 microseconds per bit;
- reset/latch time modeled as 280 microseconds;
- estimated transmit time and maximum refresh rate per output.

It does not simulate waveform pulse widths, voltage drop, power injection, current draw, wire impedance or ESP32 interrupt behavior. Those remain firmware and hardware validation concerns.
