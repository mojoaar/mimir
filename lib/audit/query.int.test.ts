import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, closePools } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects } from '../db/seed'
import { listAudit, listAuditActions, toCsv } from './query'

let alice = ''

async function add(action: string, detail: unknown, daysAgo = 0, actorId: string | null = null) {
  await adminPool().query(
    `insert into audit_log (actor_type, actor_id, action, detail, created_at)
     values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`,
    [actorId ? 'user' : 'system', actorId, action, JSON.stringify(detail), String(daysAgo)],
  )
}

describe('listAudit', () => {
  beforeEach(async () => {
    await resetFixtures()
    const f = await seedTwoUsersWithProjects()
    alice = f.alice
    await add('memory.read', { path: 'auth/rotation' }, 0, alice as string)
    await add('memory.read', { path: 'deploy/compose' }, 1, alice as string)
    await add('auth.login', { ok: true }, 2, null)
  })

  it('filters by action and counts the whole match, not the page', async () => {
    const result = await listAudit({ timeZone: 'UTC', action: 'memory.read', limit: 1 })
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(2)
  })

  it('searches free text across action, target and detail', async () => {
    const result = await listAudit({ timeZone: 'UTC', text: 'rotation' })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.detail).toMatchObject({ path: 'auth/rotation' })
  })

  it('reads a day filter in the chosen zone', async () => {
    const before = await listAudit({ timeZone: 'UTC', fromDay: '2026-10-26', toDay: '2026-10-26' })
    await adminPool().query(
      `insert into audit_log (actor_type, action, created_at)
       values ('system', 'memory.read', timestamptz '2026-10-26 23:30:00+00')`,
    )

    const utc = await listAudit({ timeZone: 'UTC', fromDay: '2026-10-26', toDay: '2026-10-26' })
    expect(utc.total).toBe(before.total + 1)

    // 23:30 UTC is the next day in Auckland.
    const auckland = await listAudit({
      timeZone: 'Pacific/Auckland',
      fromDay: '2026-10-27',
      toDay: '2026-10-27',
    })
    expect(auckland.total).toBeGreaterThanOrEqual(1)
  })

  it('lists the actions that exist with their counts', async () => {
    const actions = await listAuditActions()
    expect(actions.find((entry) => entry.action === 'memory.read')?.count).toBe(2)
    expect(actions.map((entry) => entry.action)).toEqual(
      [...actions.map((entry) => entry.action)].sort(),
    )
  })

  it('joins the actor email when there is one', async () => {
    const result = await listAudit({ timeZone: 'UTC', action: 'memory.read', limit: 1 })
    expect(result.rows[0]?.actorEmail).toBe('alice@example.test')
  })

  it('lets the csv export ask for more than a page', async () => {
    for (let i = 0; i < 250; i += 1) await add('memory.read', { i })
    const page = await listAudit({ timeZone: 'UTC', limit: 50 })
    const exported = await listAudit({ timeZone: 'UTC', limit: 10_000 })

    expect(page.rows).toHaveLength(50)
    expect(exported.rows.length).toBeGreaterThan(200)
    // 250 added here plus the 3 seeded in beforeEach.
    expect(exported.total).toBe(253)
  })
})

describe('toCsv', () => {
  it('quotes fields containing a comma or a quote', () => {
    const csv = toCsv([
      {
        id: '1',
        createdAt: new Date('2026-10-26T03:00:00Z'),
        actorType: 'user',
        actorId: null,
        actorEmail: null,
        action: 'memory.read',
        targetType: null,
        targetId: null,
        detail: { note: 'a "quoted", value' },
        ip: null,
      },
    ])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      'id,created_at,actor_type,actor_id,actor_email,action,target_type,target_id,ip,detail',
    )
    expect(lines[1]).toContain(',memory.read,')
    expect(lines[1]).toContain('""note""')
  })
})

afterAll(async () => {
  await closePools()
})
