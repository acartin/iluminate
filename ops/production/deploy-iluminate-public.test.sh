#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy-iluminate-public.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

FAKE_BIN="$TEST_DIR/bin"
COMMAND_LOG="$TEST_DIR/commands.log"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker' >>"$DEPLOY_TEST_COMMAND_LOG"
printf ' <%s>' "$@" >>"$DEPLOY_TEST_COMMAND_LOG"
printf ' tag=<%s>\n' "${ILUMINATE_IMAGE_TAG:-}" >>"$DEPLOY_TEST_COMMAND_LOG"
EOF

cat >"$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf 'curl' >>"$DEPLOY_TEST_COMMAND_LOG"
printf ' <%s>' "$@" >>"$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >>"$DEPLOY_TEST_COMMAND_LOG"
EOF

chmod +x "$FAKE_BIN/docker" "$FAKE_BIN/curl"

assert_deploy_uses_compose() {
  local script="$1"
  local compose_file="$2"
  local image_tag="$3"

  : >"$COMMAND_LOG"
  PATH="$FAKE_BIN:$PATH" \
    DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
    "$script" "$image_tag" >/dev/null

  grep -Fqx "docker <compose> <--file> <$compose_file> <pull> <iluminate-public> tag=<$image_tag>" "$COMMAND_LOG"
  grep -Fqx "docker <compose> <--file> <$compose_file> <up> <-d> <--remove-orphans> <--wait> <--wait-timeout> <90> tag=<$image_tag>" "$COMMAND_LOG"
  grep -Fqx "docker <compose> <--file> <$compose_file> <ps> tag=<$image_tag>" "$COMMAND_LOG"
  grep -Fq '<https://iluminate.space/>' "$COMMAND_LOG"
}

assert_deploy_uses_compose \
  "$DEPLOY_SCRIPT" \
  "$SCRIPT_DIR/iluminate-public.compose.yml" \
  "sha-checkout"

LEGACY_DIR="$TEST_DIR/legacy-layout"
mkdir -p "$LEGACY_DIR"
cp "$DEPLOY_SCRIPT" "$LEGACY_DIR/deploy.sh"
cp "$SCRIPT_DIR/iluminate-public.compose.yml" "$LEGACY_DIR/compose.yml"
assert_deploy_uses_compose \
  "$LEGACY_DIR/deploy.sh" \
  "$LEGACY_DIR/compose.yml" \
  "sha-legacy"

OVERRIDE_DIR="$TEST_DIR/override-layout"
mkdir -p "$OVERRIDE_DIR"
cp "$DEPLOY_SCRIPT" "$OVERRIDE_DIR/deploy.sh"
cp "$SCRIPT_DIR/iluminate-public.compose.yml" "$OVERRIDE_DIR/custom.compose.yml"
: >"$COMMAND_LOG"
PATH="$FAKE_BIN:$PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  ILUMINATE_COMPOSE_FILE="custom.compose.yml" \
  "$OVERRIDE_DIR/deploy.sh" "sha-override" >/dev/null
grep -Fqx "docker <compose> <--file> <$OVERRIDE_DIR/custom.compose.yml> <pull> <iluminate-public> tag=<sha-override>" "$COMMAND_LOG"
grep -Fqx "docker <compose> <--file> <$OVERRIDE_DIR/custom.compose.yml> <up> <-d> <--remove-orphans> <--wait> <--wait-timeout> <90> tag=<sha-override>" "$COMMAND_LOG"
grep -Fqx "docker <compose> <--file> <$OVERRIDE_DIR/custom.compose.yml> <ps> tag=<sha-override>" "$COMMAND_LOG"

MISSING_DIR="$TEST_DIR/missing-compose"
mkdir -p "$MISSING_DIR"
cp "$DEPLOY_SCRIPT" "$MISSING_DIR/deploy.sh"
: >"$COMMAND_LOG"
if PATH="$FAKE_BIN:$PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  "$MISSING_DIR/deploy.sh" >"$TEST_DIR/missing.out" 2>"$TEST_DIR/missing.err"; then
  echo "Deploy unexpectedly succeeded without a colocated compose file." >&2
  exit 1
fi
grep -Fq "No production compose file found" "$TEST_DIR/missing.err"
[[ ! -s "$COMMAND_LOG" ]]

echo "deploy-iluminate-public tests passed"
