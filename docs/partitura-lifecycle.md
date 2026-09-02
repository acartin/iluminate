# Partitura Lifecycle

This document defines where a partitura lives today, which copy is authoritative, and how the firmware path should evolve.

## Current Sources

### Editable Source

The editable source of truth for the web application is:

```text
PostgreSQL
iluminate.partituras.document_json
```

`document_json` stores the authoring document used by the browser workspace:

- logical output sizes;
- segments;
- zones;
- scenes;
- clips;
- simulator defaults.

The web UI edits this document and persists it as one JSON value. Segments, zones, scenes and clips are not separate database tables at this stage.

### Generated Artifact

The firmware-facing artifact is:

```text
PostgreSQL
iluminate.partituras.generated_json
```

`generated_json` is produced from `document_json` through `lighting-core` generation and validation. It is the JSON shape that the simulator and firmware interpreter should consume.

The generated artifact must remain declarative. It must not include ESP32 pins, FastLED array names, WiFi credentials, per-device secrets, or firmware code.

The device download endpoint exposes this artifact as raw JSON:

```text
GET /api/device/partituras/{partituraKey}
```

For the current default partitura:

```text
/api/device/partituras/default_installation
```

The ESP32 setup screen stores only the API base URL, for example `http://host:8420`.
The firmware appends the fixed path above when it downloads the partitura.

### Default Template

New partituras are initialized from:

```text
services/web/iluminate/lib/lighting/partitura-model.ts
createDefaultPartituraDocument()
```

This is a product template, not the live source of truth. Changing it affects newly created partituras only. Existing partituras live in Postgres and must be migrated or updated explicitly when needed.

### Firmware Spike Fixture

The monorepo contains a temporary Arduino IDE spike under:

```text
services/firmware/esp32-fastled-spike/
```

This spike embeds a partitura JSON string to prove that an ESP32 can parse and execute `partitura.v1`. It is not the production firmware source tree.

### PlatformIO Firmware Repository

The current organized ESP32 firmware work lives outside this monorepo:

```text
git@github.com:acartin/iluminate-firmware-esp32.git
```

Local clone on the development server:

```text
/home/acartin/iluminate-firmware-esp32
```

Local clone on the Windows flashing workstation:

```text
C:\work\Proyecto Iluminate\Dev\iluminate-firmware-esp32
```

At the current stage, the PlatformIO firmware still embeds a partitura JSON string. This is temporary and exists only to validate the runtime on hardware.

## Target Flow

The intended operating model is:

```text
Web editor
  -> persists document_json
  -> generates and validates generated_json
  -> exposes generated_json through a device endpoint
  -> ESP32 downloads generated_json
  -> ESP32 stores/applies it locally
  -> ESP32 executes defaultScene
  -> commands can change active scene without changing the partitura
```

Once the loader exists, changing colors, timing, zones, scenes or clips should require only a partitura update. It should not require a firmware rebuild.

Firmware upload should be needed only for interpreter changes, new supported effects, device protocol changes, bug fixes, or hardware support changes.

## Runtime Ownership

The partitura owns:

- chains and logical outputs;
- segment ranges;
- spatial pixel coordinates generated as `pixelMap`;
- zones;
- scenes;
- tracks and clips;
- effect identifiers and parameters;
- `defaultScene`.

The controller runtime owns:

- physical pin mapping;
- FastLED array allocation;
- brightness and power limits;
- WiFi/device credentials;
- active scene state;
- applied partitura id/checksum;
- command polling;
- status reporting.

`defaultScene` is part of the partitura. The current active scene is device runtime state.

## Three Logical Outputs

Controllers are expected to expose three logical outputs:

```text
1
2
3
```

The partitura should keep the three logical chains present. An unused output is represented with:

```json
{ "pixelCount": 0 }
```

This makes the controller shape stable while allowing a project to use only one or two physical strings.

Concrete pin mapping remains firmware-owned.

## Spatial Pixel Model

Iluminate uses one spatial model for linear strips and surface-like areas.

Physical outputs and segments describe wiring:

```text
output -> chain -> segment range
```

The generated partitura expands those ranges into:

```text
pixelMap[]
```

Each pixel carries:

```text
output, physical LED index, x, y, order
```

A straight strip is just a spatial row where `y = 0` and `x` increases by one per LED.
An area, letter, circle or light box uses the same structure with multiple rows or custom coordinates.

Effects should render against resolved spatial pixels. Linear effects can use `order`; spatial effects can use `x/y` or normalized coordinates.

## Current Hardware Validation State

The first hardware proof has validated:

- PlatformIO local build on Windows;
- PlatformIO upload to ESP32 over COM3;
- serial monitor at 115200;
- embedded `partitura.v1` parsing;
- WS2812B output on `output 1`;
- one 100 LED strip;
- four 25 LED segments;
- `solid`, `chase`, `pulse`, `toggle`;
- calibration scene playback.

The next architectural milestone is a local web loader:

```text
ESP32 downloads generated_json from Iluminate web/API
```
