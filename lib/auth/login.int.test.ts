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

  it('locks an account even when every attempt comes from a different address', async () => {
    for (let i = 0; i < 5; i++) {
      const other = { ip: `203.0.113.${i + 1}`, userAgent: 'vitest' }
      expect((await authenticate(fx.email, 'wrong', other)).ok).toBe(false)
    }

    expect(await authenticate(fx.email, 'correct-password', { ip: '198.51.100.7' })).toEqual({
      ok: false,
      reason: 'locked',
    })
  })

  it('spends as long on an unknown email as on a wrong password', async () => {
    // Warm the argon2 path so the first measurement is not dominated by
    // module initialisation.
    await authenticate(fx.email, 'wrong-password', meta)

    const unknownStart = performance.now()
    await authenticate('nobody@example.test', 'wrong-password', meta)
    const unknown = performance.now() - unknownStart

    const wrongStart = performance.now()
    await authenticate(fx.email, 'wrong-password', meta)
    const wrong = performance.now() - wrongStart

    // Both paths must pay one argon2 verify. A returning-early branch is an
    // account enumerator, so the unknown path may not be markedly faster.
    expect(unknown).toBeGreaterThan(wrong * 0.5)
  })

  it('audits both success and failure', async () => {
    await authenticate(fx.email, 'wrong', meta)
    await authenticate(fx.email, 'correct-password', meta)
    const { rows } = await adminPool().query('select action from audit_log order by id')
    expect(rows.map((r) => r.action)).toEqual(['auth.failed', 'auth.login'])
  })
})
