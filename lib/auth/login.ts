import { audit } from '../audit'
import { withService } from '../db/tx'
import { mfaEnabled, verifyMfaCode } from './mfa'
import { verifyPassword, verifyPasswordForTiming } from './password'
import { checkLoginRateLimit, clearLoginRateLimit, recordLoginFailure } from './rate-limit'
import { createSession } from './session'

export { resetLoginRateLimit } from './rate-limit'

export type LoginResult =
  | { ok: true; cookieValue: string }
  | { ok: false; reason: 'invalid' | 'pending' | 'disabled' | 'locked' | 'mfa_required' }

export type PasswordResult =
  | { ok: true; userId: string; mfaRequired: boolean }
  | { ok: false; reason: 'invalid' | 'pending' | 'disabled' | 'locked' }

export type MfaResult =
  | { ok: true; cookieValue: string }
  | { ok: false; reason: 'invalid_code' | 'replayed' | 'not_enrolled' }

type UserRow = {
  id: string
  password_hash: string | null
  status: 'pending' | 'active' | 'disabled'
  failed_logins: number
  locked_until: Date | null
}

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

export type RequestMeta = { ip: string | null; userAgent?: string | null }

/** One failure, one audit row, one counter increment. */
async function fail(
  reason: 'invalid' | 'pending' | 'disabled' | 'locked',
  detail: Record<string, unknown>,
  meta: RequestMeta,
): Promise<PasswordResult> {
  await audit({
    actorType: 'user',
    actorId: null,
    action: 'auth.failed',
    detail: { reason, ...detail },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { ok: false, reason }
}

async function startSession(userId: string, meta: RequestMeta, detail?: Record<string, unknown>) {
  const { cookieValue } = await createSession(userId, {
    ip: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  })

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'auth.login',
    detail,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { ok: true as const, cookieValue }
}

/**
 * Step one: prove the password. No session is created here - an enrolled user
 * still owes a code, and handing out a session first would make the second
 * step decorative.
 */
export async function authenticatePassword(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<PasswordResult> {
  const normalised = email.trim().toLowerCase()
  if (!checkLoginRateLimit(normalised).allowed) {
    return fail('locked', { email: normalised, source: 'rate_limit' }, meta)
  }

  const user = await withService(async (tx) => {
    const { rows } = await tx.query<UserRow>(
      `select id, password_hash, status, failed_logins, locked_until
         from users where email = $1`,
      [normalised],
    )
    return rows[0] ?? null
  })

  // Same answer for an unknown account and a wrong password: the login form
  // must not become an account enumerator. The dummy verify keeps the response
  // time identical too - returning here would answer in milliseconds.
  if (!user) {
    await verifyPasswordForTiming()
    return fail('invalid', { email: normalised }, meta)
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    return fail('locked', { email: normalised, source: 'account' }, meta)
  }

  const passwordOk = user.password_hash
    ? await verifyPassword(user.password_hash, password)
    : false

  // Password first, then status: checking the status first would let anyone
  // learn whether an address is pending or disabled without knowing its
  // password at all.
  if (!passwordOk) {
    recordLoginFailure(normalised)
    await withService((tx) =>
      tx.query(
        `update users
            set failed_logins = failed_logins + 1,
                locked_until = case
                  when failed_logins + 1 >= $2 then now() + ($3 || ' minutes')::interval
                  else locked_until
                end
          where id = $1`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      ),
    )
    return fail('invalid', { email: normalised }, meta)
  }

  if (user.status !== 'active') {
    return fail(user.status, { email: normalised }, meta)
  }

  await withService((tx) =>
    tx.query(
      `update users
          set failed_logins = 0, locked_until = null, last_login_at = now()
        where id = $1`,
      [user.id],
    ),
  )
  clearLoginRateLimit(normalised)

  return { ok: true, userId: user.id, mfaRequired: await mfaEnabled(user.id) }
}

/** Step two: the code, then the session. */export async function completeMfaLogin(
  userId: string,
  code: string,
  meta: RequestMeta,
): Promise<MfaResult> {
  const checked = await verifyMfaCode(userId, code)
  if (!checked.ok) return checked

  return startSession(userId, meta, { mfa: true })
}

/** The session half of a successful login, for callers that split the steps. */
export async function createLoginSession(
  userId: string,
  meta: RequestMeta,
): Promise<{ ok: true; cookieValue: string }> {
  return startSession(userId, meta)
}

/** Password only, for callers that do not want to know about MFA. */
export async function authenticate(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<LoginResult> {
  const result = await authenticatePassword(email, password, meta)
  if (!result.ok) return result
  if (result.mfaRequired) return { ok: false, reason: 'mfa_required' }

  return startSession(result.userId, meta)
}
