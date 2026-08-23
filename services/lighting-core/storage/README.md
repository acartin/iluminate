# Lighting Storage

Persistence adapters and repositories for lighting-owned tables.

Expected future tables include projects, controllers, partituras, deployments, device commands, device status and assets metadata.

A project has one current partitura. Persistence should not create partitura revision tables or revision-numbered JSON artifacts; when a user wants a variant, the application should duplicate the partitura as a separate record.

PostgreSQL is the target database. All persistent lighting business records must include `client_id` from the first schema design, matching the copied auth model.
