# Iluminate Web

Authenticated Next.js operator application for projects, assets, Designer,
Animate, compilation/generation, scene sharing and the protected render harness.

## Responsibility

- Provide the authenticated portal shell and project/partitura workflows.
- Host the fabrication-oriented Designer and Animate/player surfaces.
- Expose HTTP adapters for project, asset, partitura, render and share flows.
- Reuse the canonical schemas and validation behavior from `lighting-core`.
- Provide the protected browser render harness consumed by `render-worker`.

The browser never connects to PostgreSQL. Server-only modules in `lib/server`
currently use `pg` and parameterized SQL with trusted `client_id` context. This
is the established persistence approach; adding an ORM or query builder is an
explicit architecture decision, not an incidental implementation change.

`lighting-core` remains the canonical owner of partitura and effect semantics.

## Authentication mode

With `ILUMINATE_API_BASE_URL` empty and `ILUMINATE_PLACEHOLDER_AUTH=true`, any
non-empty username/password opens the development console. Real auth can be
enabled through the external auth API configuration without changing browser
database access.

## Development and validation

From this directory with Node installed:

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

From the repository root, the Docker build installs dependencies, builds
`lighting-core`, runs the web tests and builds Next.js:

```bash
docker compose build iluminate-web
```

The app listens on container port `3000` and defaults to host port `8420` in
Compose.
