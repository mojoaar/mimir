import { randomBytes } from 'node:crypto'
import { withService } from '@/lib/db/tx'
import { sha256 } from '@/lib/crypto'
import type { AuthUser } from './types'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PREFIX_LENGTH = 15
const LAST_USED_INTERVAL = '1 minute'

function base62(input: Buffer): string {
  let n = BigInt('0x' + input.toString('hex'))
  let out = ''
  const radix = BigInt(BASE62.length)
  while (n > BigInt(0)) {
    out = BASE62[Number(n % radix)] + out
    n /= radix
  }
  return out
}

export type ApiKeySummary = {
  id: string
  name: string
  prefix: string
  lastUsedAt: Date | null
  revoked: boolean
}

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ id: string; token: string; prefix: string }> {
  // 32 random bytes: nothing to brute-force, so SHA-256 at rest is enough and the
  // MCP path stays fast. Argon2 here would cost ~50ms per request for no gain.
  const token = 'mimir_' + base62(randomBytes(32))
  const prefix = token.slice(0, PREFIX_LENGTH)

  const row = await withService(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into api_keys (user_id, name, prefix, key_hash)
       values ($1, $2, $3, $4) returning id`,
      [userId, name, prefix, sha256(token)],
    )
    return rows[0]
  })
  if (!row) throw new Error('api key insert returned no row')

  return { id: row.id, token, prefix }
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const { rows } = await withService((tx) =>
    tx.query<{
      id: string
      name: string
      prefix: string
      last_used_at: Date | null
      revoked_at: Date | null
    }>(
      `select id, name, prefix, last_used_at, revoked_at
         from api_keys where user_id = $1 order by created_at desc`,
      [userId],
    ),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.last_used_at,
    revoked: r.revoked_at !== null,
  }))
}

export async function resolveApiKey(token: string): Promise<AuthUser | null> {
  const { rows } = await withService((tx) =>
    tx.query<{
      id: string
      email: string
      name: string
      role: 'admin' | 'user'
      status: string
      totp_secret_enc: Buffer | null
      key_id: string
    }>(
      `select u.id, u.email, u.name, u.role, u.status, u.totp_secret_enc, k.id as key_id
         from api_keys k join users u on u.id = k.user_id
        where k.key_hash = $1 and k.revoked_at is null`,
      [sha256(token)],
    ),
  )
  const row = rows[0]
  if (!row || row.status !== 'active') return null

  // Touching last_used_at on every MCP call would write on every request; once a
  // minute is enough for the UI and keeps the hot path read-only. Never awaited:
  // a failed timestamp must not fail an authenticated call.
  void withService((tx) =>
    tx.query(
      `update api_keys set last_used_at = now()
        where id = $1 and (last_used_at is null or last_used_at < now() - interval '${LAST_USED_INTERVAL}')`,
      [row.key_id],
    ),
  ).catch(() => {})

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mfaEnabled: row.totp_secret_enc !== null,
  }
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  await withService((tx) =>
    tx.query(
      `update api_keys set revoked_at = now()
        where id = $1 and user_id = $2 and revoked_at is null`,
      [id, userId],
    ),
  )
}
