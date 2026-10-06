# Iluminate AI Working Rules

**Authority:** mandatory operating instructions for AI work in this repository.
**Human entry point:** `.agent/ILUMINATE_BOOTSTRAP.md`.
**Goal:** load the smallest reliable context, preserve architectural decisions,
make scoped changes and validate them without turning generated context into a
second source of truth.

## 1. Start Every Task Here

Do not preload every file in `.agent` or `docs`.

1. Read this file.
2. Classify the request by work mode and area using sections 2 and 3.
3. Read only the required context for that area.
4. Inspect the current code, tests and configuration in the affected paths.
5. State scope and assumptions before tool use when the task requires tools.
6. Perform the requested work in small, reviewable changes.
7. Validate according to `.agent/EXECUTION_MAP.md` only when implementation or
   configuration changed.
8. Update authoritative documentation only when a contract, architecture,
   operation or durable workflow actually changed.

The normal mandatory context is this file plus the task-specific row in section
3. `BRAIN_MAP.md` and `AI_CONTEXT_PACK.md` are not startup requirements.

## 2. Classify The Work Mode

| Mode | Permitted behavior | Expected result |
|---|---|---|
| Explain or review | Read code/context and report findings. Do not modify files. | Evidence-backed answer. |
| Diagnose | Reproduce or inspect enough to identify cause. Do not fix unless requested. | Cause, evidence and impact. |
| Implement or refactor | Modify the smallest responsible surface and validate it. | Working change plus validation. |
| Plan or design | Inspect current implementation before proposing future structure. | Decisions, tradeoffs and ordered work. |
| Operate or deploy | Read the operational runbook, verify targets and protect secrets. | Explicit command/result and rollback awareness. |

If the request mixes modes, use the least expansive interpretation that still
fulfills it. A request to review does not authorize implementation or external
deployment.

## 3. Context Router By Area

Read the first column for every task. Add only the documents in the matching
row. "Required context" means the relevant headings for the concrete task; read
the whole document only when the change crosses most of its contract. A task
spanning several areas may combine rows, but duplicated documents are read once.

| Area or affected path | Required context | Read additionally only when relevant |
|---|---|---|
| Any task | `.agent/RULES.md` | `.agent/BRAIN_MAP.md` only for unfamiliar structure or ownership. |
| Product scope, architecture or roadmap | `.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md` | `.agent/IMPLEMENTATION_PLAN.md` for phases/priorities; relevant current code before accepting the document as current behavior. |
| Service ownership, new folders, moves or cross-service dependencies | `.agent/FILESYSTEM_GUARDRAILS.md` | Service README files; `BRAIN_MAP.md` for the current high-level topology. |
| Designer canvas interaction, tools, bars, Layers or selection UX | Relevant headings in `.agent/DESIGNER_UX_CONTRACT.md` and `.agent/DESIGNER_HANDOFF.md` | `.agent/ILUMINATE_UI_STANDARDS.md` for shared UI conventions. |
| Designer geometry engine, projections, booleans, text or fabrication export | Relevant implementation headings in `.agent/DESIGNER_HANDOFF.md` | UX contract only when controls/interactions change; `docs/upgrade.doc` only for regression history or unfinished acceptance checks. |
| Animate renderer or optical preview | Animate/rendering headings in `.agent/DESIGNER_HANDOFF.md` | UX contract for operator behavior; effect model/lifecycle only if their contracts change. |
| Composer, routes, controller, LED density or generated pixelMap | `.agent/PIXELMAP_COMPOSER_DIRECTION.md`, `.agent/DESIGNER_HANDOFF.md` | `.agent/EFFECT_TARGETING_MODEL.md` when targets/effect coordinates change; `docs/partitura-lifecycle.md` when Compile/Generate state changes. |
| Effects, zones, groups, simulator or playback semantics | `.agent/EFFECT_TARGETING_MODEL.md` | `.agent/PIXELMAP_COMPOSER_DIRECTION.md`, `docs/partitura-lifecycle.md`, and current effect/player code as applicable. |
| Partitura schema, Compile, Generate, publication or device artifact | `docs/partitura-lifecycle.md` | `.agent/DATABASE_MODEL.md`, schema/validator fixtures and device/firmware README files. |
| PostgreSQL, persistence, tenancy or migrations | `.agent/DATABASE_MODEL.md` | `.agent/FILESYSTEM_GUARDRAILS.md`; `docs/production-deployment.md` only when production operation is involved. |
| Auth, sessions, roles or permissions | `.agent/FILESYSTEM_GUARDRAILS.md`, relevant `services/auth` README/code | `.agent/DATABASE_MODEL.md` for persisted ownership; production runbook only for deployment. |
| Authenticated web UI outside Designer | `.agent/ILUMINATE_UI_STANDARDS.md` | `.agent/DESIGNER_UX_CONTRACT.md` only for shared Designer surfaces. |
| Public site, catalog, templates, SEO or learning | `.agent/PUBLIC_SITE_DIRECTION.md` | `.agent/ILUMINATE_UI_STANDARDS.md` only for intentionally shared primitives; production runbook for publishing. |
| Internal prompt builder or domain/guardrail catalog | `services/web/iluminate-prompt-builder/README.md`, `.agent/RULES.md` | `.agent/FILESYSTEM_GUARDRAILS.md` when ownership or service topology changes. |
| Compose, environment, infrastructure or production deployment | `.agent/EXECUTION_MAP.md`, `docs/production-deployment.md` | `.agent/FILESYSTEM_GUARDRAILS.md` for ownership changes. |
| External firmware or device protocol | `docs/partitura-lifecycle.md`, relevant `services/firmware` or `services/device-protocol` README | `.agent/EFFECT_TARGETING_MODEL.md` if playback contract changes. |
| Validation only | `.agent/EXECUTION_MAP.md` | The contract document for the changed area if a failure reveals ambiguity. |

### Should `docs/` Be Read?

Yes, conditionally. `docs/` contains operational and lifecycle truth that is
too detailed for the permanent AI rules:

- `docs/partitura-lifecycle.md` is authoritative for editable, compiled,
  generated and device-facing partitura states.
- `docs/production-deployment.md` is the human operational runbook and is read
  only for infrastructure, production or deployment work.
- `docs/upgrade.doc` records the Designer upgrade specification, completed
  phases and regression expectations. It is historical/supporting context, not
  routine Designer startup context.

Never read all of `docs/` by default. When a new durable document is added, add
one routing entry here and state whether it is authoritative, operational,
supporting or historical.

## 4. Context Budget And Progressive Disclosure

Use three levels:

1. **Level 0 — Route:** this file and the user's request.
2. **Level 1 — Contract:** only the required documents from section 3 and the
   directly affected code/tests.
3. **Level 2 — Expansion:** neighboring modules, history, plans or generated
   maps only when Level 1 leaves a concrete question unanswered.

Stop loading context as soon as ownership, applicable contracts, current
behavior and validation are clear. Prefer targeted headings, symbol search and
specific code paths over reading an entire large document.

Do not load the same information from an original document and from
`AI_CONTEXT_PACK.md`. Originals win.

## 5. Authority And Conflict Resolution

Use this precedence for statements about current behavior:

1. Current executable code, schemas, migrations and deterministic tests.
2. `.agent/RULES.md` for AI procedure, safety and context routing.
3. The area-specific contract named in section 3.
4. Current operational documentation in `docs/`.
5. Current handoff and implementation plan.
6. Product/background direction.
7. Generated maps and manifests.

This does not mean silently overriding a declared product decision with an
accidental implementation. When code and contract disagree:

1. identify the exact conflict;
2. determine whether the task is asking to align code or documentation;
3. avoid broadening the change without authorization;
4. report unresolved ambiguity before making an irreversible choice.

Label future direction, current behavior and historical decisions explicitly.

## 6. Generated Context Policy

`.agent/BRAIN_MAP.md` is a generated structural snapshot. It helps with service
discovery and freshness, but it is not a source of product truth.

`.agent/AI_CONTEXT_PACK.md` is a generated compact manifest. It exists for
orientation and integrity checks; it must not embed copies of large documents
or source files and must not be loaded during normal startup.

Run `bash .agent/regenerar_contexto.sh` only when:

- either generated file is missing;
- service topology, compose services or the context-document inventory changed;
- a major architecture change was completed;
- the user explicitly requests a refreshed context snapshot.

Do not regenerate merely because HEAD changed or before every task. Current
code is inspected directly. The generator records commit, dirty state and
fingerprints so a dirty worktree is not presented as a clean commit snapshot.

For an external handoff, create an explicit task-specific bundle outside the
tracked context files. Include only this file, the matching contract documents
and a concise list of affected code paths.

## 7. Architecture Guardrails

- The compiled core defines controller capabilities; the partitura defines an
  installation.
- Do not create different firmware per installation or download arbitrary code
  to the ESP32.
- `services/lighting-core` owns the canonical LED/partitura domain.
- `services/web/iluminate` presents and edits contracts; it is not the canonical
  domain and must not connect directly to PostgreSQL.
- `services/auth` owns identity and permissions without absorbing LED-domain
  internals.
- Organized ESP32 firmware lives outside this monorepo. This repository
  produces, validates, simulates and publishes partituras.
- The currently supported repository contract models logical controller outputs
  1, 2 and 3. Future controller profiles require an explicit contract change;
  they are not implied by roadmap text.
- Physical wiring and visual targets remain separate. Operators author
  controller/data-cable/LED-string topology plus zones/groups; raw logical
  ranges and pixelMap entries are derived.
- Persistent business data is tenant-scoped with trusted `client_id` context.
- PostgreSQL is the target persistent database.

## 8. Security And Environment

For DB, Docker, deployment or environment work:

- Verify required variable names without printing their values.
- Never dump `.env` or secrets into output, generated context or documentation.
- When a command needs local environment variables, use
  `set -a; source .env; set +a; <command>` without echoing them.
- Stop if a critical variable is missing.
- Credentials belong in environment/secret stores, never source or docs.
- Mutations such as logout use POST or another appropriate non-GET method.
- Backend/auth permissions are authoritative.
- Never trust a freely submitted tenant, organization or role as authority;
  derive `client_id` from session, device credentials or trusted backend state.
- The public web container must not receive database, R2-write, session or
  device secrets.

## 9. Implementation Practice

- Identify the owning service before editing.
- Inspect local instructions and current tests near the target path.
- Preserve unrelated user changes in a dirty worktree.
- Prefer the smallest coherent patch; avoid opportunistic rewrites.
- Reuse existing contracts, primitives and domain vocabulary.
- Put APIs and persistent rules in the service that owns the domain.
- Keep Next API routes as UI adapters; move canonical domain logic to its owner.
- Mark temporary mocks explicitly.
- Add or update deterministic tests for behavior changes and regressions.
- Do not modify documentation merely to narrate code churn. Update it when a
  durable rule, workflow, contract, topology or operator behavior changes.

## 10. Validation And Completion

For changes, read `.agent/EXECUTION_MAP.md` near the validation stage and run
the smallest relevant checks. At minimum:

- shell changes: `bash -n`;
- compose changes: `docker compose config`;
- web/core changes: the mapped build/test and focused regression checks;
- documentation/context changes: link/path review, generator syntax and
  consistency checks.

Report what ran and what did not run. A task is complete when the requested
outcome exists, relevant validation passes or limitations are explicit, and
authoritative documentation is aligned.

## 11. Immediate Rejection Conditions

Stop or challenge changes that would:

- turn Iluminate into a general vector editor, WLED clone or video system;
- make the web application the canonical partitura implementation;
- mix auth/session logic into `lighting-core`;
- move organized firmware drivers into the web or this monorepo;
- connect a browser directly to PostgreSQL;
- remove tenant, permission, schema or deployment safety checks;
- treat generated context as more authoritative than source documents/code;
- require reading the entire `.agent` or `docs` tree for every task.
