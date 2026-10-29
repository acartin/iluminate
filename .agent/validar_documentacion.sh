#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  echo "FAIL repository: no se encontro el repositorio Git" >&2
  exit 1
fi

cd "$repo_root"
failures=0
checks=0

fail() {
  echo "FAIL $1" >&2
  failures=$((failures + 1))
}

pass() {
  echo "PASS $1"
  checks=$((checks + 1))
}

check_path_list() {
  local label="$1"
  local missing=0
  local path

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ ! -e "$path" ]]; then
      fail "$label: ruta inexistente $path"
      missing=1
    fi
  done

  if [[ "$missing" -eq 0 ]]; then
    pass "$label"
  fi
}

check_path_list "router" < <(
  perl -ne '
    $active = 1 if /^## 3\. Context Router/;
    $active = 0 if /^### Should/;
    next unless $active;
    while (/`((?:\.agent|docs|services)\/[^`*<>]+)`/g) {
      $path = $1;
      $path =~ s{/+$}{};
      print "$path\n";
    }
  ' .agent/RULES.md | sort -u
)

check_path_list "catalogo prompt-builder" < <(
  perl -ne 'while (/"((?:AGENTS\.md|\.env\.example|compose\.yml|\.agent\/[^" ]+|docs\/[^" ]+|services\/[^" ]+))"/g) { print "$1\n" }' \
    services/web/iluminate-prompt-builder/catalog.mjs | sort -u
)

link_failures=0
while IFS='|' read -r source target; do
  [[ -z "$source" || -z "$target" ]] && continue
  target="${target%%#*}"
  target="${target%%\?*}"
  target="${target#<}"
  target="${target%>}"
  [[ -z "$target" ]] && continue
  if [[ ! -e "$(dirname "$source")/$target" ]]; then
    fail "links Markdown: $source -> $target"
    link_failures=1
  fi
done < <(
  find .agent docs -maxdepth 1 -type f -name '*.md' -print0 |
    xargs -0 perl -ne '
      while (/\[[^]]*\]\(([^)]+)\)/g) {
        $target = $1;
        next if $target =~ m{^(?:https?:|mailto:|#)};
        print "$ARGV|$target\n";
      }
    '
)
[[ "$link_failures" -eq 0 ]] && pass "links Markdown locales"

coverage_failures=0
while IFS= read -r document; do
  [[ -z "$document" ]] && continue
  if ! rg -Fq ".agent/$document" .agent/RULES.md; then
    fail "cobertura router: .agent/$document"
    coverage_failures=1
  fi
done < <(
  find .agent -maxdepth 1 -type f -name '*.md' \
    ! -name 'RULES.md' \
    ! -name 'BRAIN_MAP.md' \
    ! -name 'AI_CONTEXT_PACK.md' \
    ! -name 'ILUMINATE_BOOTSTRAP.md' \
    -printf '%f\n' | sort
)
[[ "$coverage_failures" -eq 0 ]] && pass "cobertura de documentos originales"

manifest_failures=0
while IFS='|' read -r file expected_lines expected_hash; do
  [[ -z "$file" ]] && continue
  if [[ ! -f "$file" ]]; then
    fail "manifiesto: falta $file"
    manifest_failures=1
    continue
  fi

  actual_lines="$(wc -l < "$file" | tr -d ' ')"
  actual_hash="$(sha256sum "$file" | awk '{print substr($1, 1, 16)}')"
  if [[ "$actual_lines" != "$expected_lines" || "$actual_hash" != "$expected_hash" ]]; then
    fail "manifiesto: huella desactualizada para $file"
    manifest_failures=1
  fi
done < <(
  perl -ne 'if (/^\| `([^`]+)` \| ([0-9]+) \| `([0-9a-f]+)` \|/) { print "$1|$2|$3\n" }' \
    .agent/AI_CONTEXT_PACK.md
)
[[ "$manifest_failures" -eq 0 ]] && pass "integridad del manifiesto"

if rg -n "IMPLEMENTATION_PLAN" .agent docs services AGENTS.md \
  --glob '!validar_documentacion.sh' >/dev/null; then
  fail "plan obsoleto: quedan referencias a IMPLEMENTATION_PLAN"
else
  pass "plan obsoleto eliminado"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Documentacion invalida: $failures fallo(s), $checks comprobacion(es) aprobada(s)." >&2
  exit 1
fi

echo "Documentacion valida: $checks comprobaciones aprobadas."
