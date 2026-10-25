import { withUser } from '@/lib/db/tx'
import { audit } from '@/lib/audit'

export const MAX_AVATAR_BYTES = 128 * 1024
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type Avatar = { bytes: Buffer; type: string }

function invalid(message: string) {
  return Object.assign(new Error(`invalid_params: ${message}`), { code: 'invalid_params' })
}

export async function setAvatar(userId: string, bytes: Buffer, type: string): Promise<void> {
  if (!AVATAR_TYPES.includes(type as (typeof AVATAR_TYPES)[number])) {
    throw invalid('an avatar must be a png, jpeg or webp image')
  }
  if (bytes.length === 0) throw invalid('that file is empty')
  if (bytes.length > MAX_AVATAR_BYTES) throw invalid('an avatar must be at most 128 KB')

  await withUser(userId, async (client) => {
    await client.query('update users set avatar = $2, avatar_type = $3 where id = $1', [
      userId,
      bytes,
      type,
    ])
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'account.avatar',
        targetType: 'user',
        targetId: userId,
        detail: { bytes: bytes.length, type },
      },
      client,
    )
  })
}

export async function clearAvatar(userId: string): Promise<void> {
  await withUser(userId, async (client) => {
    await client.query('update users set avatar = null, avatar_type = null where id = $1', [userId])
  })
}

export async function getAvatar(userId: string): Promise<Avatar | null> {
  return withUser(userId, async (client) => {
    const result = await client.query<{ avatar: Buffer | null; avatar_type: string | null }>(
      'select avatar, avatar_type from users where id = $1',
      [userId],
    )
    const row = result.rows[0]
    if (!row?.avatar || !row.avatar_type) return null
    return { bytes: row.avatar, type: row.avatar_type }
  })
}

/** A round icon for an account with no picture: the first letter on the accent. */
export function initialAvatar(email: string): Buffer {
  const letter = (email.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" rx="32" fill="#2c3e50"/>` +
      `<text x="32" y="42" font-family="system-ui,sans-serif" font-size="30" font-weight="600"` +
      ` fill="#ffffff" text-anchor="middle">${letter}</text></svg>`,
  )
}
