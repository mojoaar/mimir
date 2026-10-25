import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queries: [] as { text: string; values: unknown[] }[],
  audited: [] as Record<string, unknown>[],
  serviceCalls: 0,
}))

vi.mock('@/lib/db/tx', () => ({
  withService: async (run: (client: unknown) => Promise<unknown>) => {
    mocks.serviceCalls += 1
    return run({
      query: async (text: string, values: unknown[]) => {
        mocks.queries.push({ text, values })
        return { rowCount: 3 }
      },
    })
  },
}))

vi.mock('@/lib/audit', () => ({
  audit: async (entry: Record<string, unknown>) => {
    mocks.audited.push(entry)
  },
}))

import { revokeOtherSessions } from '@/lib/auth/session'

const userId = '11111111-1111-4111-8111-111111111111'
const keep = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  mocks.queries.length = 0
  mocks.audited.length = 0
  mocks.serviceCalls = 0
})

describe('revoking the sessions you are not using', () => {
  it('refuses a session id that is not one', async () => {
    await expect(revokeOtherSessions(userId, '')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    await expect(revokeOtherSessions(userId, 'not-a-uuid')).rejects.toMatchObject({
      code: 'invalid_params',
    })

    expect(mocks.queries).toHaveLength(0)
    expect(mocks.audited).toHaveLength(0)
  })

  it('uses the caller transaction instead of opening a second connection', async () => {
    const client = {
      query: async (text: string, values: unknown[]) => {
        mocks.queries.push({ text, values })
        return { rowCount: 2 }
      },
    }

    const revoked = await revokeOtherSessions(userId, keep, client as never)

    expect(revoked).toBe(2)
    expect(mocks.serviceCalls).toBe(0)
    expect(mocks.queries).toHaveLength(1)
    expect(mocks.queries[0]?.values).toEqual([userId, keep])
  })

  it('writes one audit row saying how many it signed out', async () => {
    await revokeOtherSessions(userId, keep, {
      query: async () => ({ rowCount: 3 }),
    } as never)

    expect(mocks.audited).toHaveLength(1)
    expect(mocks.audited[0]).toMatchObject({
      action: 'auth.session_revoke',
      detail: { all: true, except: keep, revoked: 3 },
    })
  })
})
