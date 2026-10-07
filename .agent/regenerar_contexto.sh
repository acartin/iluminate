#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  echo "No se encontro el repositorio Git de Iluminate." >&2
  exit 1
fi

cd "$repo_root"

out_dir=".agent"
brain_file="$out_dir/BRAIN_MAP.md"
pack_file="$out_dir/AI_CONTEXT_PACK.md"
now_utc="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")"
commit="$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")"

hash_stream() {
  sha256sum | awk '{print $1}'
}

status_snapshot="$(
  git status --porcelain=v1 --untracked-files=all -- . \
    ':(exclude).agent/BRAIN_MAP.md' \
    ':(exclude).agent/AI_CONTEXT_PACK.md'
)"
status_fingerprint="$(printf '%s' "$status_snapshot" | hash_stream)"
tracked_diff_fingerprint="$(
  git diff --binary HEAD -- . \
    ':(exclude).agent/BRAIN_MAP.md' \
    ':(exclude).agent/AI_CONTEXT_PACK.md' |
    hash_stream
)"

if [[ -n "$status_snapshot" ]]; then
  worktree_state="dirty"
  changed_path_count="$(printf '%s\n' "$status_snapshot" | awk 'NF { count++ } END { print count + 0 }')"
else
  worktree_state="clean"
  changed_path_count="0"
fi

compose_services() {
  local compose_file="${1:-compose.yml}"

  if [[ ! -f "$compose_file" ]]; then
    echo "(compose no encontrado)"
    return 0
  fi

  if command -v docker >/dev/null 2>&1 &&
    docker compose -f "$compose_file" config --services >/dev/null 2>&1; then
    docker compose -f "$compose_file" config --services
    return 0
  fi

  awk '
    /^services:/ { in_services=1; next }
    /^[a-zA-Z0-9._-]+:/ { if ($0 !~ /^services:/) in_services=0 }
    in_services && $0 ~ /^  [a-zA-Z0-9._-]+:$/ {
      gsub(":", "", $1)
      print $1
    }
  ' "$compose_file"
}

service_topology() {
  find services -mindepth 1 -maxdepth 2 -type d \
    \( -name node_modules -o -name .next -o -name dist -o -name build \) -prune \
    -o -type d -print |
    sort
}

brain_tmp="$(mktemp)"
pack_tmp="$(mktemp)"
trap 'rm -f "$brain_tmp" "$pack_tmp"' EXIT

cat > "$brain_tmp" <<EOF
# Iluminate Brain Map

> Generated structural snapshot. It is not an instruction file or a source of
> product truth. Start with \`.agent/RULES.md\`.

## Snapshot

- Generated UTC: \`$now_utc\`
- Repository root: \`$repo_root\`
- Git branch: \`$branch\`
- Git commit: \`$commit\`
- Worktree: \`$worktree_state\` ($changed_path_count changed paths, excluding generated context files)
- Status fingerprint: \`$status_fingerprint\`
- Tracked diff fingerprint: \`$tracked_diff_fingerprint\`

The commit identifies the base revision. When the worktree is dirty, the two
fingerprints distinguish the local state without copying diffs or secrets into
this file. Untracked file contents are never read for fingerprinting.

## Service Ownership

| Path | Owner |
|---|---|
| \`services/web/iluminate\` | Authenticated Next.js UI, Designer and UI adapters. |
| \`services/web/iluminate-public\` | Public site and read-only public experiences. |
| \`services/web/iluminate-prompt-builder\` | Internal generator for scoped AI change contracts. |
| \`services/lighting-core\` | Canonical LED, effect, partitura and validation domain. |
| \`services/auth\` | Identity, sessions, organizations, roles and permissions. |
| \`services/render-worker\` | Private queue worker for deterministic MP4/WebP scene rendering. |
| \`services/device-protocol\` | Cloud/controller protocol contracts. |
| \`services/firmware\` | Compatibility notes and temporary spikes; organized firmware is external. |
| \`docs\` | Lifecycle and operational runbooks selected by task. |
| \`.agent\` | AI router, durable contracts and generated context metadata. |

## Compose Services

\`\`\`text
$(compose_services compose.yml)
\`\`\`

## Context Inventory

| Document | Role |
|---|---|
| \`AGENTS.md\` | Repository-level pointer to the mandatory AI rules. |
| \`.agent/RULES.md\` | Mandatory AI procedure and context router. |
| \`.agent/ILUMINATE_BOOTSTRAP.md\` | Human guide for assigning work to AI. |
| \`.agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md\` | Product/domain direction. |
| \`.agent/FILESYSTEM_GUARDRAILS.md\` | Service ownership and dependency boundaries. |
| \`.agent/DESIGNER_UX_CONTRACT.md\` | Authoritative Designer interaction contract. |
| \`.agent/DESIGNER_HANDOFF.md\` | Current Designer implementation handoff. |
| \`.agent/PIXELMAP_COMPOSER_DIRECTION.md\` | Composer and physical mapping direction. |
| \`.agent/EFFECT_TARGETING_MODEL.md\` | Effect targets and coordinate semantics. |
| \`.agent/ILUMINATE_UI_STANDARDS.md\` | Authenticated web UI standards. |
| \`.agent/PUBLIC_SITE_DIRECTION.md\` | Public-site product and visual direction. |
| \`.agent/DATABASE_MODEL.md\` | Persistence and tenant model. |
| \`.agent/IMPLEMENTATION_PLAN.md\` | Roadmap and phase status. |
| \`.agent/EXECUTION_MAP.md\` | Validation routes and commands. |
| \`services/web/iluminate-prompt-builder/README.md\` | Internal prompt-builder usage and ownership. |
| \`docs/partitura-lifecycle.md\` | Partitura source/compile/generate/device lifecycle. |
| \`docs/production-deployment.md\` | Production operations runbook. |
| \`docs/upgrade.doc\` | Completed Designer upgrade specification and regression history. |

## Current Service Topology

\`\`\`text
$(service_topology)
\`\`\`

Use \`rg --files <affected-path>\` for file-level discovery. A complete file
inventory is intentionally omitted because it is expensive, noisy and quickly
stale.
EOF

mv "$brain_tmp" "$brain_file"

manifest_row() {
  local file="$1"
  local role="$2"
  local lines
  local digest

  if [[ ! -f "$file" ]]; then
    printf '| `%s` | missing | - | %s |\n' "$file" "$role" >> "$pack_tmp"
    return 0
  fi

  lines="$(wc -l < "$file" | tr -d ' ')"
  digest="$(sha256sum "$file" | awk '{print substr($1, 1, 16)}')"
  printf '| `%s` | %s | `%s` | %s |\n' "$file" "$lines" "$digest" "$role" >> "$pack_tmp"
}

cat > "$pack_tmp" <<EOF
# Iluminate AI Context Manifest

> Optional generated manifest. Do not load it during normal startup and do not
> use it instead of the original documents. Start with \`.agent/RULES.md\`.

## Snapshot

- Generated UTC: \`$now_utc\`
- Git branch: \`$branch\`
- Git commit: \`$commit\`
- Worktree: \`$worktree_state\` ($changed_path_count changed paths, excluding generated context files)
- Status fingerprint: \`$status_fingerprint\`
- Tracked diff fingerprint: \`$tracked_diff_fingerprint\`

## How To Use

1. Read \`.agent/RULES.md\`.
2. Select the task area in its Context Router.
3. Read the named original documents and affected code.
4. Use this manifest only to confirm document presence or detect snapshot drift.

No document or source excerpt is embedded here. This avoids duplicate tokens,
partial 180-line copies and conflicts with the originals.

## Document Integrity

| File | Lines | SHA-256 prefix | Role |
|---|---:|---|---|
EOF

manifest_row "AGENTS.md" "Repository AI entry point"
manifest_row ".agent/RULES.md" "AI procedure and router"
manifest_row ".agent/ILUMINATE_BOOTSTRAP.md" "Human workflow"
manifest_row ".agent/BRAIN_MAP.md" "Generated structural snapshot"
manifest_row ".agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md" "Product/domain direction"
manifest_row ".agent/FILESYSTEM_GUARDRAILS.md" "Service boundaries"
manifest_row ".agent/DESIGNER_UX_CONTRACT.md" "Designer UX contract"
manifest_row ".agent/DESIGNER_HANDOFF.md" "Current Designer handoff"
manifest_row ".agent/PIXELMAP_COMPOSER_DIRECTION.md" "Composer/pixelMap direction"
manifest_row ".agent/EFFECT_TARGETING_MODEL.md" "Effect targeting"
manifest_row ".agent/ILUMINATE_UI_STANDARDS.md" "Authenticated UI standards"
manifest_row ".agent/PUBLIC_SITE_DIRECTION.md" "Public site direction"
manifest_row ".agent/DATABASE_MODEL.md" "Persistence model"
manifest_row ".agent/IMPLEMENTATION_PLAN.md" "Roadmap"
manifest_row ".agent/EXECUTION_MAP.md" "Validation map"
manifest_row "services/web/iluminate-prompt-builder/README.md" "Internal prompt builder"
manifest_row "docs/partitura-lifecycle.md" "Partitura lifecycle"
manifest_row "docs/production-deployment.md" "Production runbook"
manifest_row "docs/upgrade.doc" "Designer upgrade history/regression"

mv "$pack_tmp" "$pack_file"

echo "Generated $brain_file and $pack_file"
echo "Snapshot: commit=$commit worktree=$worktree_state changed_paths=$changed_path_count"
