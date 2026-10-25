import { getConfig } from '@/lib/config'
import { decrypt, deriveKey, encrypt } from '@/lib/crypto'

const INFO = 'mimir/mfa-ticket'
const TTL_MS = 5 * 60 * 1000

export const MFA_TICKET_COOKIE = 'mimir_mfa'

export const MFA_TICKET_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 300,
} as const

/**
 * Proof that the password step passed, so the code step does not have to ask
 * for it again. Sealed rather than stored: it carries a user id, and a session
 * must not be creatable from a value the browser can edit.
 */
export function issueTicket(userId: string): string {
  const key = deriveKey(getConfig().secret, INFO)
  const payload = JSON.stringify({ userId, exp: Date.now() + TTL_MS })
  return encrypt(key, payload).toString('base64url')
}

export function readTicket(value: string): string | null {
  try {
    const key = deriveKey(getConfig().secret, INFO)
    const parsed = JSON.parse(decrypt(key, Buffer.from(value, 'base64url'))) as {
      userId?: unknown
      exp?: unknown
    }
    if (typeof parsed.userId !== 'string' || parsed.userId === '') return null
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null
    return parsed.userId
  } catch {
    return null
  }
}
