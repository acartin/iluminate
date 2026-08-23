#!/usr/bin/env bash
set -euo pipefail

MAX_LINES_PER_FILE="${MAX_LINES_PER_FILE:-180}"
MAX_FILE_SIZE_KB="${MAX_FILE_SIZE_KB:-256}"

OUT_DIR=".agent"
BRAIN_FILE="$OUT_DIR/BRAIN_MAP.md"
OUT_FILE="$OUT_DIR/AI_CONTEXT_PACK.md"

mkdir -p "$OUT_DIR"

repo_root="$(pwd)"
now_utc="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")"
commit="$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

append() {
  printf "%s\n" "$*" >> "$tmp_file"
}

append_section() {
  append ""
  append "## $1"
  append ""
}

append_codeblock() {
  local lang="$1"
  shift
  append '```'"$lang"
  printf "%s\n" "$@" >> "$tmp_file"
  append '```'
}

append_file_excerpt() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  local size_kb
  size_kb="$(du -k "$file" | cut -f1)"
  if (( size_kb > MAX_FILE_SIZE_KB )); then
    append "- \`$file\` (omitido: ${size_kb}KB > ${MAX_FILE_SIZE_KB}KB)"
    return 0
  fi

  append "### \`$file\`"
  append ""
  append '```'
  sed -n "1,${MAX_LINES_PER_FILE}p" "$file" >> "$tmp_file"
  append '```'
}

append_range_excerpt() {
  local file="$1"
  local start="$2"
  local end="$3"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  append "### \`$file:$start-$end\`"
  append ""
  append '```'
  sed -n "${start},${end}p" "$file" >> "$tmp_file"
  append '```'
}

compose_services() {
  local compose_file="${1:-compose.yml}"

  if [[ ! -f "$compose_file" ]]; then
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker compose -f "$compose_file" config --services >/dev/null 2>&1; then
      docker compose -f "$compose_file" config --services
      return 0
    fi
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

tree_if_exists() {
  local path="$1"
  if [[ -d "$path" ]]; then
    find "$path" -maxdepth 4 \
      \( -path '*/__pycache__' -o -path '*/.next' -o -path '*/node_modules' -o -path '*/dist' -o -path '*/build' \) -prune \
      -o -type d -print | sort | sed 's|^\./||'
  fi
}

files_if_exists() {
  local path="$1"
  if [[ -d "$path" ]]; then
    find "$path" -maxdepth 4 \
      \( -path '*/__pycache__' -o -path '*/.next' -o -path '*/node_modules' -o -path '*/dist' -o -path '*/build' -o -name '*.pyc' \) -prune \
      -o -type f -print | sort | sed 's|^\./||' | head -n 260
  fi
}

cat > "$BRAIN_FILE" <<EOF
# BRAIN_MAP

- Generated UTC: \`$now_utc\`
- Repo root: \`$repo_root\`
- Git branch: \`$branch\`
- Git commit: \`$commit\`

## 1. MAPA DE INTENCIONES (ILUMINATE)

| Carpeta | Responsabilidad tecnica | Importancia (1-5) |
|---|---|---:|
| \`compose.yml\` | Compose local actual; validar antes de tocar infraestructura. | 4 |
| \`services/web/iluminate\` | Next.js UI, portal, editor/simulador inicial y adaptadores temporales. | 5 |
| \`services/lighting-core\` | Dominio LED: chains, segments, zones, partitura, scenes, validation y deployments. | 5 |
| \`services/auth\` | Identidad, organizaciones, roles, permisos, sesiones y auth API. | 4 |
| \`services/simulator\` | Simulacion reusable cuando salga del prototipo web. | 4 |
| \`services/device-protocol\` | Contratos cloud/controlador y estado deseado/reportado. | 4 |
| \`services/firmware\` | Notas de contrato con el firmware ESP32 externo; no build en este repo. | 4 |
| \`.agent\` | Reglas operativas y contexto maestro para agentes. | 5 |

## 2. LIMITES DE ARQUITECTURA

- Este repo produce y valida partituras; el firmware ESP32 que las interpreta se construye fuera del monorepo.
- El modelo de dominio vive en \`lighting-core\`, no en el web.
- Auth vive en \`auth\`, no en \`lighting-core\`.
- El web no se conecta directo a Postgres.
- El ESP32 externo ejecuta partitura validada, no codigo arbitrario.
- El hardware se modela aqui solo como tres salidas logicas: \`chain.output\` 1, 2 y 3.
- El sistema es multitenant por diseno; toda tabla persistente de negocio debe contemplar \`client_id\`.
- PostgreSQL es la base de datos objetivo.
- Mantener separados chains/segments fisicos y zones visuales.

## 3. SERVICIOS DOCKER ACTUALES

\`\`\`text
$(compose_services compose.yml)
\`\`\`

## 4. TOPOLOGIA DE TRABAJO

\`\`\`text
$(tree_if_exists services)
\`\`\`

## 5. ARCHIVOS RELEVANTES

\`\`\`text
$(files_if_exists services)
$(files_if_exists .agent)
\`\`\`
EOF

append "# AI Context Pack"
append ""
append "- Generated UTC: \`$now_utc\`"
append "- Repo root: \`$repo_root\`"
append "- Git branch: \`$branch\`"
append "- Git commit: \`$commit\`"
append "- Policy: high-signal only; enfocado en Iluminate."

append_section "Contexto Maestro"
append_file_excerpt "$BRAIN_FILE"
append_file_excerpt ".agent/AI_CONTEXT_LED_ORCHESTRATION_PLATFORM.md"
append_file_excerpt ".agent/FILESYSTEM_GUARDRAILS.md"

append_section "Reglas Operativas"
append_file_excerpt ".agent/RULES.md"
append_file_excerpt ".agent/EXECUTION_MAP.md"
append_file_excerpt ".agent/IMPLEMENTATION_PLAN.md"
append_file_excerpt ".agent/ILUMINATE_UI_STANDARDS.md"
append_file_excerpt ".agent/ILUMINATE_BOOTSTRAP.md"

append_section "Compose y Variables"
append "### Servicios del compose principal"
append ""
append_codeblock text "$(compose_services compose.yml)"
append_range_excerpt "compose.yml" 1 220
append_file_excerpt ".env.example"

append_section "Topologia"
append_codeblock text "$(tree_if_exists services)"

append_section "Archivos"
append_codeblock text "$(files_if_exists services)"

append_section "Extractos de Servicio"
append_file_excerpt "services/README.md"
append_file_excerpt "services/web/iluminate/README.md"
append_file_excerpt "services/web/iluminate/package.json"
append_file_excerpt "services/web/iluminate/lib/api.ts"
append_file_excerpt "services/web/iluminate/lib/modules.ts"
append_file_excerpt "services/lighting-core/README.md"
append_file_excerpt "services/auth/README.md"
append_file_excerpt "services/simulator/README.md"
append_file_excerpt "services/device-protocol/README.md"
append_file_excerpt "services/firmware/README.md"

mv "$tmp_file" "$OUT_FILE"

echo "Generated $BRAIN_FILE and $OUT_FILE"
