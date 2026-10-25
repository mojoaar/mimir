import { describe, expect, it } from 'vitest'
import { decrypt, deriveKey, encrypt, redact, sha256 } from './crypto'

const key = deriveKey('a'.repeat(64), 'provider-keys')

describe('crypto', () => {
  it('round-trips a secret', () => {
    const blob = encrypt(key, 'sk-live-1234567890')
    expect(decrypt(key, blob)).toBe('sk-live-1234567890')
  })

  it('refuses a blob that was tampered with', () => {
    const blob = encrypt(key, 'sk-live-1234567890')
    blob[blob.length - 1]! ^= 0xff
    expect(() => decrypt(key, blob)).toThrow(/decrypt/)
  })

  it('derives different keys for different purposes', () => {
    expect(deriveKey('a'.repeat(64), 'backup')).not.toEqual(deriveKey('a'.repeat(64), 'provider-keys'))
  })

  it('redacts all but the last four characters', () => {
    expect(redact('sk-live-1234567890')).toBe('*'.repeat(14) + '7890')
  })

  it('hashes deterministically', () => {
    expect(sha256('x')).toEqual(sha256('x'))
    expect(sha256('x')).toHaveLength(32)
  })
})
