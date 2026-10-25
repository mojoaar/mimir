import { describe, expect, it, vi } from 'vitest'

// The database is down in this test: both the check and the bearer lookup fail.
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('@/lib/db/tx', () => ({
  withService: async () => {
    throw new Error('getaddrinfo ENOTFOUND db')
  },
}))
vi.mock('@/lib/auth/apikey', () => ({
  resolveApiKey: async () => {
    throw new Error('getaddrinfo ENOTFOUND db')
  },
}))

const { handleHealth } = await import('./health')

describe('handleHealth while the database is down', () => {
  it('answers 503 to a caller holding a token, instead of 500', async () => {
    // A monitor that sends a bearer must still learn the database is down; a
    // 500 with an empty body tells it nothing.
    const response = await handleHealth(
      new Request('http://localhost/health', { headers: { authorization: 'Bearer mimir_x' } }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable' })
  })
})
