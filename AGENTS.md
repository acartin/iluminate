# Iluminate Agent Entry Point

Before working in this repository, read `.agent/RULES.md` and follow its work
mode, context router, authority and validation rules.

Do not preload all of `.agent` or `docs`. Read only the task-specific original
documents selected by the router. Generated context files are optional
manifests, never sources of truth.

The user's current request defines the authorized scope and overrides workflow
preferences, but it does not silently override security or destructive-action
constraints.
