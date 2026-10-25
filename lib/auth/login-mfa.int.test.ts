import { TOTP } from 'otpauth'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, TEST_PASSWORD, type Fixtures } from '@/lib/db/seed'
import { withAdmin } from '@/lib/db/tx'
import { authenticatePassword, completeMfaLogin, resetLoginRateLimit } from './login'
import { beginEnrollment, confirmEnrollment } from './mfa'

const meta = { ip: '203.0.113.7', userAgent: 'vitest' }

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  resetLoginRateLimit()
})

async function enrol(userId: string): Promise<string> {
  const { secret } = await beginEnrollment(userId)
  const code = new TOTP({ secret, digits: 6, period: 30 }).generate()
  const result = await confirmEnrollment(userId, code)
  expect(result.ok).toBe(true)
  return secret
}

async function sessionCount(userId: string): Promise<number> {
  return withAdmin(async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      'select count(*)::text as n from sessions where user_id = $1',
      [userId],
    )
    return Number(rows[0]?.n ?? '0')
  })
}

describe('logging in with two-factor enabled', () => {
  it('asks for a code instead of creating a session', async () => {
    await enrol(f.alice)

    const result = await authenticatePassword(f.email, TEST_PASSWORD, meta)

    expect(result).toMatchObject({ ok: true, mfaRequired: true })
    expect(await sessionCount(f.alice)).toBe(0)
  })

  it('creates the session once a valid code arrives', async () => {
    const secret = await enrol(f.alice)
    const code = new TOTP({ secret, digits: 6, period: 30 }).generate({
      timestamp: Date.now() + 30_000,
    })

    const result = await completeMfaLogin(f.alice, code, meta)

    expect(result.ok).toBe(true)
    expect(await sessionCount(f.alice)).toBe(1)
  })

  it('creates no session for a wrong code', async () => {
    await enrol(f.alice)

    const result = await completeMfaLogin(f.alice, '000000', meta)

    expect(result).toMatchObject({ ok: false, reason: 'invalid_code' })
    expect(await sessionCount(f.alice)).toBe(0)
  })

  it('refuses a user who is not enrolled', async () => {
    const result = await completeMfaLogin(f.bob, '123456', meta)

    expect(result).toMatchObject({ ok: false, reason: 'not_enrolled' })
  })

  it('never reaches the code step with a wrong password', async () => {
    await enrol(f.alice)

    const result = await authenticatePassword(f.email, 'wrong-password', meta)

    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
  })
})
