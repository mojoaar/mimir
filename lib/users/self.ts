import { withUser } from '@/lib/db/tx'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/tokens'
import {
  listSessions,
  revokeOtherSessions,
  revokeSessionById,
} from '@/lib/auth/session'
import { checkLoginRateLimit, clearLoginRateLimit, recordLoginFailure } from '@/lib/auth/rate-limit'
import { audit } from '@/lib/audit'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Profile = { id: string; email: string; name: string }

export type ProfilePatch = { name?: string; email?: string; currentPassword?: string }

export type SessionSummary = {
  id: string
  ip: string | null
  userAgent: string | null
  lastSeenAt: Date
  createdAt: Date
  current: boolean
}

type ServiceError = Error & { code: 'forbidden' | 'invalid_params' | 'not_found' }

function fail(code: ServiceError['code'], message: string): ServiceError {
  const error = new Error(message) as ServiceError
  error.code = code
  return error
}

async function emailTaken(error: unknown): Promise<boolean> {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

/**
 * Every function here takes the caller's own id and nothing else can widen it:
 * there is no actor parameter to get wrong, so one account cannot edit another.
 */
export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  const name = patch.name === undefined ? undefined : patch.name.trim()
  const email = patch.email === undefined ? undefined : patch.email.trim().toLowerCase()

  if (name !== undefined && (name === '' || name.length > 200)) {
    throw fail('invalid_params', 'a name is required and must be at most 200 characters')
  }
  if (email !== undefined && (!EMAIL.test(email) || email.length > 320)) {
    throw fail('invalid_params', 'that does not look like an email address')
  }

  return withUser(userId, async (client) => {
    const current = await client.query<{
      email: string
      name: string
      password_hash: string | null
    }>('select email::text as email, name, password_hash from users where id = $1', [userId])
    const row = current.rows[0]
    if (!row) throw fail('not_found', 'no such account')

    // A different address needs the password. A difference in case alone is the
    // same address, so it is a plain rename and needs nothing.
    const movesAddress = email !== undefined && email.toLowerCase() !== row.email.toLowerCase()
    const changesEmail = email !== undefined && email !== row.email

    if (movesAddress) {
      if (!row.password_hash) {
        throw fail('invalid_params', 'you have not set a password yet; use a reset link first')
      }
      await assertPasswordThrottle(row.email)
      const ok = patch.currentPassword
        ? await verifyPassword(row.password_hash, patch.currentPassword)
        : false
      if (!ok) {
        recordLoginFailure(row.email)
        throw fail('invalid_params', 'your current password is wrong')
      }
      clearLoginRateLimit(row.email)
    }

    const changed: string[] = []
    if (name !== undefined) changed.push('name')
    if (changesEmail) changed.push('email')
    if (changed.length === 0) return { id: userId, email: row.email, name: row.name }

    try {
      const updated = await client.query<{ email: string; name: string }>(
        `update users
            set name = coalesce($2, name),
                email = coalesce($3, email)
          where id = $1
          returning email::text as email, name`,
        [userId, name ?? null, changesEmail ? email : null],
      )
      const result = updated.rows[0]
      if (!result) throw fail('not_found', 'no such account')

      await audit(
        {
          actorType: 'user',
          actorId: userId,
          action: 'auth.profile_update',
          targetType: 'user',
          targetId: userId,
          detail: { changed },
        },
        client,
      )

      return { id: userId, email: result.email, name: result.name }
    } catch (error) {
      if (await emailTaken(error)) throw fail('invalid_params', 'that email is already in use')
      throw error
    }
  })
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
  currentSessionId: string,
): Promise<void> {
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw fail('invalid_params', `a password needs at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  await withUser(userId, async (client) => {
    const found = await client.query<{ email: string; password_hash: string | null }>(
      'select email::text as email, password_hash from users where id = $1',
      [userId],
    )
    const hash = found.rows[0]?.password_hash
    const email = found.rows[0]?.email
    if (!hash || !email) {
      throw fail('invalid_params', 'you have not set a password yet; use a reset link')
    }
    await assertPasswordThrottle(email)
    const ok = await verifyPassword(hash, current)
    if (!ok) {
      recordLoginFailure(email)
      throw fail('invalid_params', 'your current password is wrong')
    }
    clearLoginRateLimit(email)

    await client.query('update users set password_hash = $2 where id = $1', [
      userId,
      await hashPassword(next),
    ])
    // Same transaction: one connection, and the revocation cannot outlive a rollback.
    await revokeOtherSessions(userId, currentSessionId, client)
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'auth.password_change',
        targetType: 'user',
        targetId: userId,
        detail: { revokedOthers: true },
      },
      client,
    )
  })
}

export async function listMySessions(
  userId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const sessions = await listSessions(userId)
  return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }))
}

export async function revokeOwnSession(userId: string, sessionId: string): Promise<void> {
  const revoked = await revokeSessionById(userId, sessionId)
  if (!revoked) throw fail('not_found', 'that session is gone')
  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'auth.session_revoke',
    targetType: 'session',
    targetId: sessionId,
  })
}

/**
 * The change forms check a password just like the login form does, so they use
 * the same bucket: someone holding a stolen cookie gets five guesses, not
 * unlimited ones, and a restart does not hand them a fresh budget.
 */
async function assertPasswordThrottle(email: string): Promise<void> {
  const limit = checkLoginRateLimit(email)
  if (limit.allowed) return
  const minutes = Math.max(1, Math.ceil(limit.retryAfter / 60))
  throw fail('invalid_params', `too many attempts; try again in ${minutes} minutes`)
}
