import { describe, it, expect, beforeAll } from 'vitest'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { createApiKey, listApiKeys, resolveApiKey, revokeApiKey } from './apikey'

let f: Fixtures

beforeAll(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('api keys', () => {
  it('returns the token once and a stable prefix', async () => {
    const k = await createApiKey(f.alice, 'laptop')
    expect(k.token.startsWith('mimir_')).toBe(true)
    expect(k.prefix).toBe(k.token.slice(0, 15))
    expect((await listApiKeys(f.alice))[0]?.prefix).toBe(k.prefix)
  })

  it('authenticates a live key and rejects a revoked one', async () => {
    const k = await createApiKey(f.alice, 'laptop')
    expect((await resolveApiKey(k.token))?.id).toBe(f.alice)
    await revokeApiKey(f.alice, k.id)
    expect(await resolveApiKey(k.token)).toBeNull()
  })

  it('rejects a key belonging to a disabled user', async () => {
    const k = await createApiKey(f.bob, 'laptop')
    await adminPool.query("update users set status = 'disabled' where id = $1", [f.bob])
    expect(await resolveApiKey(k.token)).toBeNull()
  })

  it('does not list another user\'s keys and refuses to revoke them', async () => {
    const k = await createApiKey(f.alice, 'alice-only')
    expect((await listApiKeys(f.carol)).map((r) => r.id)).not.toContain(k.id)
    await revokeApiKey(f.carol, k.id)
    expect(await resolveApiKey(k.token)).not.toBeNull()
  })

  it('rejects a token it never issued', async () => {
    expect(await resolveApiKey('mimir_not-a-real-key')).toBeNull()
  })
})
