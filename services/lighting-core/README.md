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
- single editable partitura per project
- controller-facing deployment payloads
- deterministic simulator contracts

It may contain an API under `api/`, pure domain logic under `domain/`, schemas under `schemas/`, persistence under `storage/`, and shared fixtures under `fixtures/`.

Persistent records owned by lighting-core are multitenant by design. Projects, controllers, partituras, deployments, device commands and status records must be scoped by the trusted `client_id` context provided by auth or device identity.

Each project owns one current partitura. Iluminate does not model partitura revisions or version history; duplicating a partitura creates a separate partitura record instead of another revision of the same one.

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

The initial TypeScript package exports:

- `generatePartitura`: builds a normalized `partitura.v1` document from a configuration command.
- `validatePartitura`: returns deterministic, human-readable validation issues.
- `effectCatalog`: declares the first supported compiled-core effect identifiers.
- `renderSceneFrame`: basic deterministic scene renderer for web simulation and firmware parity checks.
- `simulateWs2812bFrame`: WS2812B-like output simulator with per-output buffers, GRB transport order and estimated refresh timing.

The first supported effect identifiers are:

- `off`
- `solid`
- `fade`
- `pulse`
- `chase`

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
