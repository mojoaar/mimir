import { describe, expect, it, vi } from 'vitest'

// The update that records `last_used_at` runs after the answer is decided, so a
// failure there must never turn a valid key into a 401.
const mocks = vi.hoisted(() => ({ calls: 0 }))

vi.mock('@/lib/db/tx', () => ({
  withService: async (fn: (tx: unknown) => Promise<unknown>) => {
    mocks.calls += 1
    if (mocks.calls > 1) throw new Error('pool is down')
    return fn({
      query: async () => ({
        rows: [
          {
            id: 'user-1',
            email: 'alice@example.test',
            name: 'Alice',
            role: 'user',
            status: 'active',
            totp_secret_enc: null,
            key_id: 'key-1',
          },
        ],
      }),
    })
  },
}))

import { resolveApiKey } from './apikey'

describe('resolveApiKey when the timestamp write fails', () => {
  it('still returns the user the key belongs to', async () => {
    mocks.calls = 0

    await expect(resolveApiKey('mimir_whatever')).resolves.toMatchObject({
      id: 'user-1',
      email: 'alice@example.test',
    })
    expect(mocks.calls).toBe(2)
  })
})
