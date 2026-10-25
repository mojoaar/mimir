import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { authenticate, resetLoginRateLimit } from './login'

let fx: Fixtures
const meta = { ip: '203.0.113.9', userAgent: 'vitest' }

beforeEach(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
  resetLoginRateLimit()
})

describe('authenticate', () => {
  it('rejects a pending user', async () => {
    expect((await authenticate(fx.pendingEmail, 'correct-password', meta)).ok).toBe(false)
  })

  it('rejects a disabled user', async () => {
    const r = await authenticate(fx.disabledEmail, 'correct-password', meta)
    expect(r).toEqual({ ok: false, reason: 'disabled' })
  })

  it('locks after five failed attempts from one ip', async () => {
    for (let i = 0; i < 5; i++) expect((await authenticate(fx.email, 'wrong', meta)).ok).toBe(false)
    expect(await authenticate(fx.email, 'correct-password', meta)).toEqual({ ok: false, reason: 'locked' })
  })

  it('audits both success and failure', async () => {
    await authenticate(fx.email, 'wrong', meta)
    await authenticate(fx.email, 'correct-password', meta)
    const { rows } = await adminPool().query('select action from audit_log order by id')
    expect(rows.map((r) => r.action)).toEqual(['auth.failed', 'auth.login'])
  })
})
