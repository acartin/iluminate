# Lighting Core Domain

Pure domain logic for LED choreography.

The vocabulary here must match the product document:

- chain
- segment
- zone
- partitura
- scene
- track
- clip
- effect
- controller
- deployment

No React, Next.js, database client, or ESP32-specific driver code belongs here.

The implemented firmware-facing model lives under `domain/partituras` and uses
`partitura.v2`. Realtime preparation and evaluation live under `player/` and
must remain independent from React, Web Workers and graphics APIs.
