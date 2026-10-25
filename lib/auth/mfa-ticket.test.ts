import { describe, expect, it, vi } from 'vitest'
import { deriveKey, encrypt } from '@/lib/crypto'
import { issueTicket, readTicket } from './mfa-ticket'

// The ticket only needs a secret; the rest of the config is irrelevant here.
vi.mock('@/lib/config', () => ({ getConfig: () => ({ secret: 'a'.repeat(64) }) }))

const { getConfig } = await import('@/lib/config')

describe('the mfa ticket', () => {
  it('round-trips the user it was issued for', () => {
    expect(readTicket(issueTicket('user-123'))).toBe('user-123')
  })

  it('rejects a tampered value', () => {
    const ticket = issueTicket('user-123')
    const flipped = ticket.slice(0, -2) + (ticket.endsWith('A') ? 'BB' : 'AA')

    expect(readTicket(flipped)).toBeNull()
    expect(readTicket('not-a-ticket')).toBeNull()
  })

  it('rejects a ticket that has expired', () => {
    const key = deriveKey(getConfig().secret, 'mimir/mfa-ticket')
    const expired = encrypt(
      key,
      JSON.stringify({ userId: 'user-123', exp: Date.now() - 1000 }),
    ).toString('base64url')

    expect(readTicket(expired)).toBeNull()
  })
})
