#!/usr/bin/env bash
# Start, stop or reset the local dev/test Postgres.
set -euo pipefail

compose='docker-compose.dev.yml'
cd "$(dirname "$0")/.."

case "${1:-up}" in
  up)
    docker compose -f "$compose" up -d --wait
    ;;
  down)
    docker compose -f "$compose" down
    ;;
  reset)
    docker compose -f "$compose" down -v
    docker compose -f "$compose" up -d --wait
    ;;
  *)
    echo "usage: $0 [up|down|reset]" >&2
    exit 2
    ;;
esac
