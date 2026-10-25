#!/bin/sh
# Restore a Mimir database from a `pg_dump -Fc` file, encrypted or not.
#
# `.enc` files are the encrypted artifacts the backup job uploads: they are
# decrypted with MIMIR_SECRET (see scripts/decrypt-backup.mjs) and piped
# straight into pg_restore, so the plaintext dump never lands on disk.
#
# POSIX sh, not bash: this script is copied into the Alpine image and run there.
set -eu

if [ "${1:-}" = '' ] || [ "${2:-}" != '--yes' ]; then
  cat >&2 <<'USAGE'
usage: scripts/restore.sh <dump-file> --yes

Restores over the database in DATABASE_ADMIN_URL. --clean drops existing objects.
Set DATABASE_ADMIN_URL to the owner connection string, not the app one.
A .enc file needs MIMIR_SECRET: the same secret that wrote the backup.
USAGE
  exit 2
fi

file=$1
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
: "${DATABASE_ADMIN_URL:?set DATABASE_ADMIN_URL to the owner connection string}"

case "$file" in
  *.enc)
    : "${MIMIR_SECRET:?set MIMIR_SECRET to the secret that wrote this backup}"
    here=$(cd "$(dirname "$0")" && pwd)
    node "$here/decrypt-backup.mjs" "$file" \
      | pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_ADMIN_URL"
    echo "restored $file (decrypted)"
    ;;
  *)
    pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_ADMIN_URL" "$file"
    echo "restored $file"
    ;;
esac
