# Iluminate Services

In this monorepo, `services` means product capability or bounded domain. A service may be a runtime, an API, a shared domain core, contract notes, or a UI surface.

Current service map:

- `web/iluminate`: Next.js operator and authoring interface.
- `lighting-core`: LED installation, partitura, scene, simulator-facing and deployment-domain core.
- `auth`: identity, organizations, memberships, roles, sessions and authorization contracts.
- `firmware`: compatibility notes and temporary ESP32 spikes; the organized PlatformIO firmware lives in `git@github.com:acartin/iluminate-firmware-esp32.git`.

See `docs/partitura-lifecycle.md` for the authoritative flow between editable partitura documents, generated artifacts, simulator and firmware.
