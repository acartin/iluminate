# Retired ESP32 Spike

The in-repository legacy Arduino spike was removed during the atomic
`partitura.v2` cutover. Keeping it buildable would leave a second executable
contract and create false confidence about production firmware parity.

The production PlatformIO firmware is owned by the external repository named
in `services/firmware/README.md`. It must consume the canonical fixture at
`services/lighting-core/fixtures/partitura-v2-minimal.json` and the schema at
`services/lighting-core/schemas/partitura.v2.schema.json`.

This directory remains only as a tombstone for old local instructions. No v1
parser, embedded payload or hardware fallback is shipped from this monorepo.
