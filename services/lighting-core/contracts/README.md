# Lighting Core Contracts

Shared contracts for web, API, simulator and device communication.

Examples:

- deployment command DTOs
- device status payloads
- partitura export metadata
- validation error shapes

## Current Partitura Contract

The current domain contract is `partitura.v1`, exported by the TypeScript package in this service.

The contract is intentionally logical:

- chains target logical outputs `1`, `2` and `3`;
- segments are ranges inside chains;
- generated partituras include `pixelMap`, where every rendered pixel has physical address plus `x/y` coordinates;
- zones group segments or child zones;
- scenes contain tracks;
- tracks target installation, chain, segment or zone;
- clips reference compiled-core effect identifiers and parameters.

Linear strips and surface-like areas use the same spatial pixel model. A strip is a row of pixels where `y = 0`; a rectangular or custom-lit area is represented by the same physical pixels with non-linear coordinates.

It does not include ESP32 pin numbers, FastLED array names, brightness constants or per-installation firmware code.
