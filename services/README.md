# Iluminate Services

In this monorepo, `services` means product capability or bounded domain. A service may be a runtime, an API, a shared domain core, contract notes, or a UI surface.

Current service map:

- `web/iluminate`: Next.js operator and authoring interface.
- `web/iluminate-public`: public Next.js experience for `iluminate.space`, concept projects, reusable templates and Designer/Animate learning content.
- `web/iluminate-prompt-builder`: internal, dependency-free prompt contract generator; it protects unselected domains and emits repo-aware context, paths, guardrails and validation instructions for new AI sessions.
- `lighting-core`: LED installation, partitura, scene, simulator-facing and deployment-domain core.
- `auth`: identity, organizations, memberships, roles, sessions and authorization contracts.
- `render-worker`: private queue worker for deterministic MP4/WebP scene media.
- `device-protocol`: cloud/controller provisioning, desired/reported state and command contracts.
- `firmware`: compatibility notes and temporary ESP32 spikes; the organized PlatformIO firmware lives in `git@github.com:acartin/iluminate-firmware-esp32.git`.

The authenticated web runtime and render worker currently use server-side `pg`
repositories with parameterized SQL. Browser code and the public site do not
connect to PostgreSQL. Canonical schema and domain ownership remain with auth
and `lighting-core`.

See `docs/partitura-lifecycle.md` for the authoritative flow between editable partitura documents, generated artifacts, simulator and firmware.
