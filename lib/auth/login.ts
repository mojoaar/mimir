import { audit } from '../audit'
import { withService } from '../db/tx'
import { verifyPassword } from './password'
import { checkLoginRateLimit, clearLoginRateLimit, recordLoginFailure } from './rate-limit'
import { createSession } from './session'

export { resetLoginRateLimit } from './rate-limit'

export type LoginResult =
  | { ok: true; cookieValue: string }
  | { ok: false; reason: 'invalid' | 'pending' | 'disabled' | 'locked' }

type UserRow = {
  id: string
  password_hash: string | null
  status: 'pending' | 'active' | 'disabled'
  failed_logins: number
  locked_until: Date | null
}

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

/** One failure, one audit row, one counter increment. */
async function fail(
  reason: 'invalid' | 'pending' | 'disabled' | 'locked',
  detail: Record<string, unknown>,
  meta: RequestMeta,
): Promise<LoginResult> {
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

export type RequestMeta = { ip: string | null; userAgent?: string | null }

export async function authenticate(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<LoginResult> {
  const normalised = email.trim().toLowerCase()
  if (!checkLoginRateLimit(meta.ip, normalised).allowed) {
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
  // must not become an account enumerator.
  if (!user) return fail('invalid', { email: normalised }, meta)

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
    recordLoginFailure(meta.ip, normalised)
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
  clearLoginRateLimit(meta.ip, normalised)

  const { cookieValue } = await createSession(user.id, {
    ip: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  })

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'auth.login',
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { ok: true, cookieValue }
}
