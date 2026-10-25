import { randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { sha256 } from '../crypto'
import { withService } from '../db/tx'
import type { AuthUser } from './types'

export { SESSION_COOKIE } from './cookie-name'
const TTL_DAYS = 30
const TOUCH_INTERVAL_SECONDS = 60

type SessionRow = {
  id: string
  user_id: string
  email: string
  name: string
  role: 'admin' | 'user'
  status: 'pending' | 'active' | 'disabled'
  totp_secret_enc: Buffer | null
  last_seen_stale: boolean
}

function toAuthUser(row: SessionRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mfaEnabled: row.totp_secret_enc !== null,
  }
}

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const cookieValue = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)

  await withService((tx) =>
    tx.query(
      `insert into sessions (user_id, token_hash, ip, user_agent, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [userId, sha256(cookieValue), meta.ip ?? null, meta.userAgent ?? null, expiresAt],
    ),
  )

  return { cookieValue, expiresAt }
}

export async function resolveSession(cookieValue: string): Promise<AuthUser | null> {
  if (!cookieValue) return null

  return withService(async (tx) => {
    const { rows } = await tx.query<SessionRow>(
      `select s.id, s.user_id, u.email, u.name, u.role, u.status, u.totp_secret_enc,
              s.last_seen_at < now() - ($2 || ' seconds')::interval as last_seen_stale
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
          and u.status = 'active'`,
      [sha256(cookieValue), String(TOUCH_INTERVAL_SECONDS)],
    )

    const row = rows[0]
    if (!row) return null

    // Sliding expiry, but at most one write a minute per session.
    if (row.last_seen_stale) {
      await tx.query(
        `update sessions set last_seen_at = now(), expires_at = now() + ($2 || ' days')::interval
          where id = $1`,
        [row.id, String(TTL_DAYS)],
      )
    }

    return toAuthUser(row)
  })
}

export async function revokeSession(cookieValue: string): Promise<void> {
  await withService((tx) =>
    tx.query(`update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, [
      sha256(cookieValue),
    ]),
  )
}

/** Call inside the same transaction as disabling a user, or the disable is cosmetic. */
export async function revokeAllSessions(userId: string, tx?: PoolClient): Promise<void> {  const run = (client: PoolClient) =>
    client.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [
      userId,
    ])
  if (tx) await run(tx)
  else await withService(run)
}

export type SessionRecord = {
  id: string
  ip: string | null
  userAgent: string | null
  lastSeenAt: Date
  createdAt: Date
}

/** The session a cookie value belongs to, so a page can mark "this device". */
export async function sessionIdFor(cookieValue: string): Promise<string | null> {
  if (!cookieValue) return null

  return withService(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select id from sessions
        where token_hash = $1 and revoked_at is null and expires_at > now()`,
      [sha256(cookieValue)],
    )
    return rows[0]?.id ?? null
  })
}

/** Live sessions only: a revoked or expired row is not something to show or act on. */
export async function listSessions(userId: string): Promise<SessionRecord[]> {
  return withService(async (tx) => {
    const { rows } = await tx.query<{
      id: string
      ip: string | null
      user_agent: string | null
      last_seen_at: Date
      created_at: Date
    }>(
      `select id, host(ip) as ip, user_agent, last_seen_at, created_at
         from sessions
        where user_id = $1 and revoked_at is null and expires_at > now()
        order by created_at desc`,
      [userId],
    )

    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.user_agent,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    }))
  })
}

/** Scoped by user_id: a session id belonging to someone else changes nothing. */
export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  return withService(async (tx) => {
    const { rowCount } = await tx.query(
      `update sessions set revoked_at = now()
        where id = $1 and user_id = $2 and revoked_at is null`,
      [sessionId, userId],
    )
    return rowCount === 1
  })
}

/** The "sign out everywhere else" verb; the current device survives. */
export async function revokeOtherSessions(userId: string, exceptId: string): Promise<void> {
  await withService((tx) =>
    tx.query(
      `update sessions set revoked_at = now()
        where user_id = $1 and id <> $2 and revoked_at is null`,
      [userId, exceptId],
    ),
  )
}
