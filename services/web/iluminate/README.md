# Iluminate Web

Basic web console for Iluminate, cloned from the Voxalia Next.js web architecture and theme.

## Responsibility

- Provide the first Iluminate web shell with the same Next.js App Router, API route and Tailwind component structure.
- Keep the authentication architecture in place: login/logout routes, httpOnly session cookie, role simulation and server-side menu contracts.
- Run without a real auth/backend service for now through placeholder auth.
- Expose starter menus and placeholder pages for workspaces, knowledge, automation, channels, insights and settings.

## Current Mode

The app is intentionally UI/API-contract first. With `ILUMINATE_API_BASE_URL` empty and `ILUMINATE_PLACEHOLDER_AUTH=true`, any non-empty username/password opens the console.

When the backend is ready, set:

```text
ILUMINATE_API_BASE_URL=http://iluminate-api:8000/api/v1
ILUMINATE_PLACEHOLDER_AUTH=false
ILUMINATE_SECURE_COOKIES=true
```

Expected backend endpoints keep the same shape as Voxalia:

```text
POST /auth/login
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/simulate-role
GET  /menu
GET  /{module-path}
```

## Local Development

```bash
npm install
npm run dev
```

From `/srv/iluminate`, the container placeholder can be built with:

```bash
docker compose up --build iluminate-web
```
