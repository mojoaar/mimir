import { getConfig } from '../config'
import { decrypt, deriveKey, encrypt } from '../crypto'

// One info string for every settings secret, separate from provider keys and backups:
// rotating the purpose does not silently invalidate the others.
const INFO = 'mimir/settings-secret'

export function sealSecret(plain: string): Buffer {
  return encrypt(deriveKey(getConfig().secret, INFO), plain)
}

export function openSecret(blob: Buffer): string {
  return decrypt(deriveKey(getConfig().secret, INFO), blob)
}

/** Stores an arbitrary settings object as one sealed blob, so no field leaks into the table. */
export function sealValue(value: unknown): { cipher: string } {
  return { cipher: sealSecret(JSON.stringify(value)).toString('base64') }
}

export function openValue<T>(stored: unknown): T | null {
  const cipher = (stored as { cipher?: unknown } | null)?.cipher
  if (typeof cipher !== 'string') return null
  return JSON.parse(openSecret(Buffer.from(cipher, 'base64'))) as T
}
