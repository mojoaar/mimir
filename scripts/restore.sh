#!/usr/bin/env bash
# Restore a Mimir database from an unencrypted `pg_dump -Fc` file.
#
# The encrypted backup format is written by the backup job in 0.2.0; restoring a
# `.enc` file is documented there once that writer exists, rather than guessed at
# here and rewritten later.
set -euo pipefail

if [ "${1:-}" = '' ] || [ "${2:-}" != '--yes' ]; then
  cat >&2 <<'USAGE'
usage: scripts/restore.sh <dump-file> --yes

Restores over the database in DATABASE_ADMIN_URL. --clean drops existing objects.
Set DATABASE_ADMIN_URL to the owner connection string, not the app one.
USAGE
  exit 2
fi

file=$1
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
: "${DATABASE_ADMIN_URL:?set DATABASE_ADMIN_URL to the owner connection string}"

case "$file" in
  *.enc) echo "encrypted backups are restored by the 0.2.0 backup tooling; decrypt first" >&2; exit 1 ;;
esac

pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_ADMIN_URL" "$file"
echo "restored $file"
