import { describe, expect, test, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.hoisted(() => vi.fn())

vi.mock('./context', () => ({ getCurrentUser }))

import { requireAdmin } from './admin'

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'someone@example.test',
  name: 'Someone',
  role: 'user' as const,
  status: 'active' as const,
  mfaEnabled: false,
}

beforeEach(() => {
  getCurrentUser.mockReset()
})

async function redirectDigest(): Promise<string> {
  try {
    await requireAdmin()
  } catch (error) {
    // redirect() throws an error whose message is only NEXT_REDIRECT; the
    // destination travels in digest.
    return String((error as { digest?: string }).digest)
  }
  throw new Error('expected a redirect')
}

describe('requireAdmin', () => {
  test('a normal user is sent back to the app', async () => {
    getCurrentUser.mockResolvedValue(user)

    expect(await redirectDigest()).toMatch(/NEXT_REDIRECT;.*\/app;/)
  })

  test('a signed-out visitor is sent to the login page', async () => {
    getCurrentUser.mockResolvedValue(null)

    expect(await redirectDigest()).toMatch(/NEXT_REDIRECT;.*\/login;/)
  })

  test('an admin gets through', async () => {
    const admin = { ...user, role: 'admin' as const }
    getCurrentUser.mockResolvedValue(admin)

    await expect(requireAdmin()).resolves.toEqual(admin)
  })
})
