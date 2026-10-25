#!/bin/sh
# Creates the runtime role on first boot. psql substitutes :'pw' only for
# script input, not for -c, so the statement goes in on stdin.
set -e

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$MIMIR_APP_PASSWORD" <<'SQL'
CREATE ROLE mimir_app LOGIN PASSWORD :'pw';
SQL
