import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, appPool } from './pool'
import { runMigrations } from './migrate'

afterAll(() => adminPool.end())

// Hermetic: the suite owns this database, so it starts from an empty schema
// rather than depending on whatever a previous run left behind.
beforeAll(async () => {
  await adminPool.query('drop schema public cascade')
  await adminPool.query('create schema public')
})

const ALICE = '00000000-0000-4000-8000-00000000a11c'
const BOB = '00000000-0000-4000-8000-00000000b0b0'
const BOB_PROJECT = '00000000-0000-4000-8000-00000000b0b1'

async function asUser<T>(userId: string, fn: (run: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<T>): Promise<T> {
  const client = await appPool.connect()
  try {
    await client.query('begin')
    await client.query("select set_config('mimir.user_id', $1, true)", [userId])
    return await fn((sql, params) => client.query(sql, params as never))
  } finally {
    // Rollback even when fn threw: a client returned to the pool with an open
    // aborted transaction poisons the next borrower.
    await client.query('rollback').catch(() => undefined)
    client.release()
  }
}

describe('migrations', () => {
  it('applies every migration once', async () => {
    const first = await runMigrations()
    expect(first.applied).toContain('0001_core.sql')
    expect(first.applied).toContain('0002_security.sql')
  })

  it('is a no-op on the second run', async () => {
    const second = await runMigrations()
    expect(second.applied).toEqual([])
  })

  it('creates the core tables', async () => {
    const { rows } = await adminPool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`
    )
    const names = rows.map((r) => r.table_name)
    for (const t of ['users','sessions','api_keys','projects','project_grants','memories','providers','tokens','audit_log','backup_runs','settings','schema_migrations']) {
      expect(names).toContain(t)
    }
  })

  it('hides another user\'s project from the runtime role', async () => {
    await adminPool.query(
      `insert into users (id, email, status) values ($1,'alice@example.test','active'), ($2,'bob@example.test','active')
       on conflict (id) do nothing`,
      [ALICE, BOB]
    )
    await adminPool.query(
      `insert into projects (id, owner_user_id, name, slug) values ($1,$2,'Bob','bob-project')
       on conflict (id) do nothing`,
      [BOB_PROJECT, BOB]
    )

    const visible = await asUser(ALICE, async (run) => (await run('select id from projects')).rows)
    expect(visible).toHaveLength(0)
  })

  it('refuses a memory written into a project the user cannot write', async () => {
    await expect(
      asUser(ALICE, (run) =>
        run('insert into memories (project_id, path, body) values ($1,$2,$3)', [
          BOB_PROJECT,
          'sneaky/path',
          'should not land',
        ])
      )
    ).rejects.toThrow(/row-level security/)
  })
})
