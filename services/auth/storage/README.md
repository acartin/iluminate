# Auth Storage

Persistence adapters and repositories for auth-owned tables.

No other service should read or write auth tables directly.

PostgreSQL is the target database. Auth owns `auth_clients`, `auth_user_clients`, roles, permissions and sessions. Other services receive `client_id` as trusted context.
