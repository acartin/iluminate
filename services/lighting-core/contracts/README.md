# Lighting Core Contracts

Shared contracts for web, API, simulator and device communication.

Examples:

- deployment command DTOs
- device status payloads
- partitura export metadata
- validation error shapes

## Current Partitura Contract

The current firmware/runtime contract is `partitura.v2`, exported by the
TypeScript package in this service. `player-bundle.v1` and `visual-scene.v1`
are separate presentation contracts for browser playback and offline video.

The contract is intentionally logical:

- outputs are always the three logical outputs `1`, `2` and `3`;
- every `pixelMap` entry has one dense `index`, physical address, `x/y`,
  normalized coordinates and tangent;
- zones and groups contain flattened dense `pixelIndices` prepared at generation
  time, so the realtime evaluator does not scan authoring geometry;
- scenes contain tracks;
- tracks target the installation, a zone or a group;
- clips reference compiled-core effect identifiers and parameters.

Linear strips and surface-like areas use the same spatial pixel model. A strip is a row of pixels where `y = 0`; a rectangular or custom-lit area is represented by the same physical pixels with non-linear coordinates.

It does not include ESP32 pin numbers, FastLED array names, brightness constants or per-installation firmware code.

`VisualSceneV1` owns shapes, optics, presentation and camera data. None of
those fields may leak back into `partitura.v2`; the firmware remains a small,
declarative score interpreter.
