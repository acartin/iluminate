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
- zones group segments or child zones;
- scenes contain tracks;
- tracks target installation, chain, segment or zone;
- clips reference compiled-core effect identifiers and parameters.

It does not include ESP32 pin numbers, FastLED array names, brightness constants or per-installation firmware code.
