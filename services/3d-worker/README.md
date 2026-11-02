# Iluminate 3D worker

This directory is currently a documentation-only service scaffold. The approved
target architecture is defined in `.agent/THREE_D_WORKER_CONTRACT.md`. There is
no runtime, container, queue, API or web interface yet.

When separately authorized, this bounded service will consume asynchronous,
tenant-scoped jobs and transform validated millimeter-based SVG fabrication
paths plus a versioned profile recipe into STEP, 3MF and STL artifacts.

It will run in its own container as a non-HTTP queue consumer. It must remain
independent from `lighting-core`, `render-worker`, Designer and Animate. The
current Designer and Animate interfaces must not expose or invoke it. A future
3D canvas will be a separate authenticated module with its own state and route.

Do not add executable files here without first reading:

- `.agent/RULES.md`
- `.agent/THREE_D_WORKER_CONTRACT.md`
- `.agent/FILESYSTEM_GUARDRAILS.md`
- `.agent/EXECUTION_MAP.md`

The planned implementation stack is Python 3.12, build123d/OCP, Pydantic,
Psycopg, Boto3 and Pytest. That list is an architectural target, not installed
dependencies.
