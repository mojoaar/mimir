import { beforeEach, describe, expect, it } from 'vitest'
import { TOTP } from 'otpauth'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { adminPool } from '@/lib/db/pool'
import { resolveSession, createSession } from '@/lib/auth/session'
import { resetMfaForUser } from '@/lib/users/service'
import { setRequireMfa } from '@/lib/settings/security'
import {
  beginEnrollment,
  confirmEnrollment,
  disableMfaForUser,
  mfaEnabled,
  mfaUri,
  verifyMfaCode,
} from './mfa'

let f: Fixtures

const step = (offset: number) => Math.floor(Date.now() / 30000) + offset

function codeFor(secret: string, offset = 0): string {
  return new TOTP({ secret }).generate({ timestamp: Date.now() + offset * 30000 })
}

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('enrolment', () => {
  it('enables MFA only after the code from the QR is confirmed', async () => {
    const { secret, uri } = await beginEnrollment(f.alice)

    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(await mfaEnabled(f.alice)).toBe(false)

    await expect(confirmEnrollment(f.alice, codeFor(secret))).resolves.toEqual({ ok: true })
    expect(await mfaEnabled(f.alice)).toBe(true)

    const { rows } = await adminPool().query<{ pending: string | null }>(
      'select totp_pending_enc::text as pending from users where id = $1',
      [f.alice],
    )
    expect(rows[0]?.pending).toBeNull()
  })

  it('refuses a code that belongs to a different secret', async () => {
    await beginEnrollment(f.alice)
    const other = beginEnrollment(f.bob)

    await expect(confirmEnrollment(f.alice, codeFor((await other).secret))).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    })
    expect(await mfaEnabled(f.alice)).toBe(false)
  })

  it('reports no_pending when nothing was started', async () => {
    await expect(confirmEnrollment(f.carol, '123456')).resolves.toEqual({
      ok: false,
      reason: 'no_pending',
    })
  })
})

describe('verification', () => {
  it('accepts a fresh code once and rejects the replay', async () => {
    const { secret } = await beginEnrollment(f.alice)
    await confirmEnrollment(f.alice, codeFor(secret))

    const next = codeFor(secret, 1)
    await expect(verifyMfaCode(f.alice, next)).resolves.toEqual({ ok: true })
    await expect(verifyMfaCode(f.alice, next)).resolves.toEqual({
      ok: false,
      reason: 'replayed',
    })
  })

  it('accepts the previous step but not one two steps old', async () => {
    const { secret } = await beginEnrollment(f.alice)
    await confirmEnrollment(f.alice, codeFor(secret))

    await adminPool().query('update users set totp_last_step = $2 where id = $1', [
      f.alice,
      step(-2),
    ])
    await expect(verifyMfaCode(f.alice, codeFor(secret, -1))).resolves.toEqual({ ok: true })

    await adminPool().query('update users set totp_last_step = $2 where id = $1', [
      f.alice,
      step(-3),
    ])
    await expect(verifyMfaCode(f.alice, codeFor(secret, -2))).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    })
  })

  it('refuses a user who never enrolled', async () => {
    await expect(verifyMfaCode(f.bob, '123456')).resolves.toEqual({
      ok: false,
      reason: 'not_enrolled',
    })
  })
})

describe('turning it off', () => {
  it('clears the secret and revokes sessions', async () => {
    const { secret } = await beginEnrollment(f.alice)
    await confirmEnrollment(f.alice, codeFor(secret))
    const { cookieValue } = await createSession(f.alice, {})

    await disableMfaForUser(f.alice)

    expect(await mfaEnabled(f.alice)).toBe(false)
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('refuses while the install requires MFA', async () => {
    const { secret } = await beginEnrollment(f.alice)
    await confirmEnrollment(f.alice, codeFor(secret))
    await setRequireMfa(true, f.admin)

    await expect(disableMfaForUser(f.alice)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await mfaEnabled(f.alice)).toBe(true)
  })
})

describe('admin reset', () => {
  it('also drops a half-finished enrolment', async () => {
    const { secret } = await beginEnrollment(f.alice)
    await confirmEnrollment(f.alice, codeFor(secret))
    await beginEnrollment(f.alice)

    await resetMfaForUser(f.admin, f.alice)

    expect(await mfaEnabled(f.alice)).toBe(false)
    await expect(verifyMfaCode(f.alice, '123456')).resolves.toEqual({
      ok: false,
      reason: 'not_enrolled',
    })
  })
})

describe('the uri', () => {
  it('names the issuer and the account', () => {
    const uri = mfaUri('JBSWY3DPEHPK3PXP', 'alice@example.test', 'Mimir')

    // otpauth percent-encodes the account label, which authenticator apps decode.
    expect(uri).toContain('otpauth://totp/Mimir:alice%40example.test')
    expect(uri).toContain('issuer=Mimir')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})
