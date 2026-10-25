#!/bin/sh
# Prints this project's digest so a harness can inject it at session start.
#
# MIMIR_URL    base URL, e.g. https://mimir.example.com
# MIMIR_TOKEN  an API key (mimir_...)
# MIMIR_PROJECT  the project slug
#
# Exits 0 and prints nothing on any problem: a missing digest must never block
# or delay a session.
set -u

[ -n "${MIMIR_PROJECT:-}" ] || exit 0
[ -n "${MIMIR_URL:-}" ] || exit 0
[ -n "${MIMIR_TOKEN:-}" ] || exit 0

curl -fsS --max-time 3 \
  -H "Authorization: Bearer $MIMIR_TOKEN" \
  -H "Accept: text/plain" \
  "${MIMIR_URL%/}/api/v1/projects/$MIMIR_PROJECT/digest?budget_tokens=800&format=text" \
  2>/dev/null || exit 0

exit 0
