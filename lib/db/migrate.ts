import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { adminPool } from './pool'

// Migrations run as the owner. In the container the directory is copied in at
// the same relative path (see Dockerfile), so cwd-relative resolution holds.
const MIGRATIONS_DIR = path.join(process.cwd(), 'lib/db/migrations')
const LOCK_NAME = 'mimir_migrations'

export async function runMigrations(): Promise<{ applied: string[] }> {
  const client = await adminPool.connect()
  let locked = false
  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [LOCK_NAME])
    locked = true
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`
    )
    const { rows } = await client.query<{ name: string }>('select name from schema_migrations')
    const done = new Set(rows.map((row) => row.name))
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort()

    const applied: string[] = []
    for (const file of files) {
      if (done.has(file)) continue
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migrations (name) values ($1)', [file])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw new Error(`migration ${file} failed: ${(error as Error).message}`, { cause: error })
      }
      applied.push(file)
    }
    return { applied }
  } finally {
    if (locked) await client.query('select pg_advisory_unlock(hashtext($1))', [LOCK_NAME])
    client.release()
  }
}
