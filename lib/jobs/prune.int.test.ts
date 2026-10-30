import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, closePools } from '../db/pool'
import { resetFixtures } from '../db/seed'
import { runPrune } from './prune'

async function add(action: string, daysAgo: number) {
  await adminPool().query(
    `insert into audit_log (actor_type, action, detail, created_at)
     values ('system', $1, '{}'::jsonb, now() - ($2 || ' days')::interval)`,
    [action, String(daysAgo)],
  )
}

describe('runPrune', () => {
  beforeEach(async () => {
    await resetFixtures()
    await add('memory.read', 40) // goes
    await add('memory.read', 10) // stays
    await add('auth.login', 400) // goes
    await add('auth.login', 100) // stays
    await add('auth.failed', 40) // goes at thirty days
    await add('auth.failed', 10) // stays
    await add('auth.password_change', 60) // stays until a year
  })

  it('drops reads after a month and everything else after a year', async () => {
    const result = await runPrune()

    expect(result).toEqual({ reads: 1, failed: 1, other: 1 })
    const { rows } = await adminPool().query<{ action: string }>(
      `select action from audit_log order by action`,
    )
    expect(rows.map((row) => row.action)).toEqual([
      'auth.failed',
      'auth.login',
      'auth.password_change',
      'memory.read',
    ])
  })

  it('refuses to run when the prune escape hatch is not set', async () => {
    // Proves the trigger still guards the table outside runPrune's transaction.
    await expect(
      adminPool().query(`delete from audit_log where action = 'memory.read'`),
    ).rejects.toThrow(/append-only/i)
  })
})

afterAll(async () => {
  await closePools()
})
