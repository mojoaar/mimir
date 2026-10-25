import { Secret, TOTP } from 'otpauth'
import { withAdmin } from '@/lib/db/tx'
import { audit } from '@/lib/audit'
import { sealSecret, openSecret } from '@/lib/settings/secrets'
import { getRequireMfa } from '@/lib/settings/security'
import { getSiteSettings } from '@/lib/settings/site'
import { revokeAllSessions } from '@/lib/auth/session'

const PERIOD = 30
const WINDOW = 1
const DIGITS = 6

export type Enrollment = { secret: string; uri: string }

export type CodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_code' | 'replayed' | 'not_enrolled' }

export type EnrollResult = { ok: true } | { ok: false; reason: 'invalid_code' | 'no_pending' }

function totpFor(secret: string, issuer?: string, label?: string): TOTP {
  return new TOTP({ secret, digits: DIGITS, period: PERIOD, issuer, label })
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / PERIOD)
}

function fail(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

export function mfaUri(secret: string, email: string, issuer: string): string {
  return new TOTP({ secret, digits: DIGITS, period: PERIOD, issuer, label: email }).toString()
}

/**
 * Starts an enrolment. The secret is written to totp_pending_enc only, so a
 * half-finished setup never becomes a login factor.
 */
export async function beginEnrollment(userId: string): Promise<Enrollment> {
  const secret = new Secret({ size: 20 })
  const base32 = secret.base32

  const email = await withAdmin(async (tx) => {
    const { rows } = await tx.query<{ email: string }>(
      'select email from users where id = $1',
      [userId],
    )
    const row = rows[0]
    if (!row) throw fail('not_found', 'That user does not exist.')

    await tx.query('update users set totp_pending_enc = $2 where id = $1', [
      userId,
      sealSecret(base32),
    ])
    return row.email
  })

  const { siteName } = await getSiteSettings()

  return { secret: base32, uri: mfaUri(base32, email, siteName) }
}

/**
 * Reads an unfinished enrolment without starting a new one, so a page that
 * re-renders does not invalidate the QR the user is looking at.
 */
export async function pendingEnrollment(userId: string): Promise<Enrollment | null> {
  const secret = await withAdmin(async (tx) => {
    const { rows } = await tx.query<{ pending: Buffer | null; email: string }>(
      'select totp_pending_enc as pending, email from users where id = $1',
      [userId],
    )
    const row = rows[0]
    if (!row?.pending) return null
    return { secret: openSecret(row.pending), email: row.email }
  })

  if (!secret) return null

  const { siteName } = await getSiteSettings()
  return { secret: secret.secret, uri: mfaUri(secret.secret, secret.email, siteName) }
}

export async function confirmEnrollment(
  userId: string,
  code: string,
): Promise<EnrollResult> {
  const result = await withAdmin(async (tx) => {
    const { rows } = await tx.query<{ pending: Buffer | null }>(
      'select totp_pending_enc as pending from users where id = $1',
      [userId],
    )
    const pending = rows[0]?.pending
    if (!pending) return { ok: false as const, reason: 'no_pending' as const }

    const secret = openSecret(pending)
    const delta = totpFor(secret).validate({ token: code, window: WINDOW })
    if (delta === null) return { ok: false as const, reason: 'invalid_code' as const }

    await tx.query(
      `update users
          set totp_secret_enc = totp_pending_enc,
              totp_pending_enc = null,
              totp_last_step = $2
        where id = $1`,
      [userId, currentStep() + delta],
    )
    await audit(
      { actorType: 'user', actorId: userId, action: 'auth.mfa_enable', targetType: 'user', targetId: userId },
      tx,
    )
    return { ok: true as const }
  })

  return result
}

export async function verifyMfaCode(userId: string, code: string): Promise<CodeResult> {
  return withAdmin(async (tx) => {
    const { rows } = await tx.query<{ secret: Buffer | null; last_step: string | null }>(
      'select totp_secret_enc as secret, totp_last_step as last_step from users where id = $1',
      [userId],
    )
    const row = rows[0]
    if (!row?.secret) return { ok: false as const, reason: 'not_enrolled' as const }

    const delta = totpFor(openSecret(row.secret)).validate({ token: code, window: WINDOW })
    if (delta === null) {
      await audit(
        { actorType: 'user', actorId: userId, action: 'auth.mfa_failed', targetType: 'user', targetId: userId },
        tx,
      )
      return { ok: false as const, reason: 'invalid_code' as const }
    }

    const step = currentStep() + delta
    // The compare happens inside the write so two simultaneous submissions of
    // the same code cannot both pass: the second matches no row.
    const claimed = await tx.query(
      `update users set totp_last_step = $2
        where id = $1 and (totp_last_step is null or totp_last_step < $2)`,
      [userId, step],
    )
    if (claimed.rowCount === 0) return { ok: false as const, reason: 'replayed' as const }
    return { ok: true as const }
  })
}

export async function mfaEnabled(userId: string): Promise<boolean> {
  return withAdmin(async (tx) => {
    const { rows } = await tx.query<{ enabled: boolean }>(
      'select totp_secret_enc is not null as enabled from users where id = $1',
      [userId],
    )
    return rows[0]?.enabled ?? false
  })
}

export async function disableMfaForUser(userId: string): Promise<void> {
  if (await getRequireMfa()) {
    throw fail('forbidden', 'This install requires two-factor authentication.')
  }

  await withAdmin(async (tx) => {
    await tx.query(
      'update users set totp_secret_enc = null, totp_pending_enc = null, totp_last_step = null where id = $1',
      [userId],
    )
    await revokeAllSessions(userId, tx)
    await audit(
      { actorType: 'user', actorId: userId, action: 'auth.mfa_disable', targetType: 'user', targetId: userId },
      tx,
    )
  })
}
