#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_TAG="${1:-main}"

export ILUMINATE_IMAGE_TAG="$IMAGE_TAG"

if [[ -n "${ILUMINATE_COMPOSE_FILE:-}" ]]; then
  COMPOSE_FILE="$ILUMINATE_COMPOSE_FILE"
  if [[ "$COMPOSE_FILE" != /* ]]; then
    COMPOSE_FILE="$SCRIPT_DIR/$COMPOSE_FILE"
  fi
elif [[ -f "$SCRIPT_DIR/iluminate-public.compose.yml" ]]; then
  COMPOSE_FILE="$SCRIPT_DIR/iluminate-public.compose.yml"
elif [[ -f "$SCRIPT_DIR/compose.yml" ]]; then
  # Compatibility with the layout currently installed on prd-web-01.
  COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
else
  echo "No production compose file found next to $0." >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Production compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

compose=(docker compose --file "$COMPOSE_FILE")

echo "Deploying iluminate-public:$IMAGE_TAG"
"${compose[@]}" pull iluminate-public
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 90

curl --fail --silent --show-error \
  --retry 5 --retry-delay 2 --retry-all-errors \
  --output /dev/null \
  https://iluminate.space/

"${compose[@]}" ps
echo "Deployment completed: https://iluminate.space"
