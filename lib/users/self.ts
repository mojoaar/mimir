import { withUser } from '@/lib/db/tx'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/tokens'
import { listSessions, revokeOtherSessions, revokeSessionById } from '@/lib/auth/session'
import { audit } from '@/lib/audit'

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
  if (email !== undefined && (!email.includes('@') || email.length > 320)) {
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

    const changesEmail = email !== undefined && email !== row.email.toLowerCase()

    // An email is the login key, so it is not changed without the password.
    if (changesEmail) {
      if (!row.password_hash) {
        throw fail('invalid_params', 'you have not set a password yet; use a reset link first')
      }
      const ok = patch.currentPassword
        ? await verifyPassword(row.password_hash, patch.currentPassword)
        : false
      if (!ok) throw fail('invalid_params', 'your current password is wrong')
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
    const found = await client.query<{ password_hash: string | null }>(
      'select password_hash from users where id = $1',
      [userId],
    )
    const hash = found.rows[0]?.password_hash
    if (!hash) {
      throw fail('invalid_params', 'you have not set a password yet; use a reset link')
    }
    const ok = await verifyPassword(hash, current)
    if (!ok) throw fail('invalid_params', 'your current password is wrong')

    await client.query('update users set password_hash = $2 where id = $1', [
      userId,
      await hashPassword(next),
    ])
    await revokeOtherSessions(userId, currentSessionId)
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
