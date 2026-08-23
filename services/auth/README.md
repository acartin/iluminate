# Auth Service

Functional domain for identity and authorization.

This service owns:

- customers/tenants/organizations
- users
- organizations
- organization memberships
- roles and permissions
- sessions or tokens
- invitations
- password recovery
- auth audit records

It may expose an API under `api/`, persist data through `storage/`, and publish shared contracts through `contracts/`.

The platform is multitenant by design. Auth uses `auth_clients` and `client_id` as the tenant convention copied from `datasyncsa`; that trusted context scopes projects, controllers, partituras and deployments.

It must not own LED installation, partitura, scene, controller or deployment domain rules.
