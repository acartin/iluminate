# Firmware Contract Notes

This directory is reserved for notes and temporary spikes that help an external ESP32 firmware project consume Iluminate partituras.

The organized firmware source, build scripts, Arduino/PlatformIO/ESP-IDF project and hardware drivers live outside this monorepo.

Current organized firmware repo:

```text
git@github.com:acartin/iluminate-firmware-esp32.git
```

The retired `esp32-fastled-spike/` folder records why the old local proof was removed. It is not a production firmware source tree.

Within this repo, the controller is represented only by three logical outputs: `1`, `2` and `3`. Mapping those outputs to concrete ESP32 pins is an external firmware concern.

## Current External Firmware Reference

The first known Arduino/FastLED firmware setup uses WS2812B strips with this mapping:

| Logical output | Firmware array | ESP32 data pin | LEDs |
|---:|---|---:|---:|
| `1` | `rayos` | `25` | `468` |
| `2` | `circulo` | `32` | `152` |
| `3` | `base` | `26` | `120` |

Current firmware brightness reference: `150`.

These values are notes about the current external firmware only. They are not application environment variables, database configuration, or partitura schema fields.

The external firmware project remains the source of truth for concrete pins, brightness, power limits and driver setup. Iluminate should produce validated partituras against logical outputs `1`, `2` and `3`; it should not embed ESP32 driver code, pin maps, credentials, or per-installation firmware source.

Authoritative partitura lifecycle documentation:

```text
docs/partitura-lifecycle.md
```

## Partitura Compatibility Target

The external firmware interpreter should first target:

- `services/lighting-core/fixtures/partitura-v2-minimal.json`
- schema version: `partitura.v2`
- required core version: `1.0.0`
- logical outputs: `1`, `2`, `3`
- effects: `off`, `solid`, `fade`, `pulse`, `chase`
- blend modes used by the fixture: `replace`, `max`, `add`
- web/core simulator: `simulateWs2812bFrame`

`schemaVersion` is a wire-format compatibility marker for the interpreter. It is not a partitura revision, and generated partituras should not include revision numbers or revision history.

Minimal firmware acceptance checklist:

1. Load the JSON partitura.
2. Reject unsupported `schemaVersion`.
3. Load the dense `pixelMap` and map each logical `output` plus `serialIndex` to the firmware arrays/pins.
4. Verify dense stable pixel indices and output bounds before activation.
5. Load the already-flattened `zone.pixelIndices` and `group.pixelIndices` target tables.
6. Select `defaultScene`.
7. Run clips from a shared scene clock.
8. Apply layers and the supported blend modes.
9. Reject unknown effect identifiers before playback.
10. Keep running locally without requiring cloud access after the partitura is loaded.

The TypeScript simulator models WS2812B-like frame behavior for parity work: serial pixel order, RGB 8-bit values, GRB transport order, 24 bits per pixel, reset/latch delay and estimated refresh timing. It is not a bit-level waveform simulator.

Current status:

- The obsolete in-repository v1 spike has been removed; it is not a release fallback.
- Production acceptance requires the external firmware to execute `partitura.v2` and the shared golden vectors.
- The PlatformIO firmware repo can build and upload from the Windows flashing workstation.
- The next target is downloading `generated_json` from the web/API so partitura changes no longer require firmware upload.
