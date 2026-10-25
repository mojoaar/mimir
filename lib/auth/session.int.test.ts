import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import { createSession, resolveSession, revokeSession } from './session'
import { hashPassword, verifyPassword } from './password'

let fx: Fixtures
let userId: string

beforeEach(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
  userId = fx.alice
})

describe('sessions', () => {
  it('creates a session that resolves to its user', async () => {
    const { cookieValue } = await createSession(userId, { ip: '1.2.3.4' })
    expect((await resolveSession(cookieValue))?.id).toBe(userId)
  })

  it('stores only the hash of the cookie value', async () => {
    const { cookieValue } = await createSession(userId, {})
    const { rows } = await adminPool.query('select token_hash from sessions')
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toEqual(cookieValue)
  })

  it('does not resolve an expired session', async () => {
    const { cookieValue } = await createSession(userId, {})
    await adminPool.query("update sessions set expires_at = now() - interval '1 second'")
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve a revoked session', async () => {
    const { cookieValue } = await createSession(userId, {})
    await revokeSession(cookieValue)
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve a session for a disabled user', async () => {
    const { cookieValue } = await createSession(userId, {})
    await adminPool.query("update users set status = 'disabled' where id = $1", [userId])
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve an unknown cookie value', async () => {
    expect(await resolveSession('not-a-real-cookie')).toBeNull()
  })
})

describe('passwords', () => {
  it('hashes passwords with argon2id and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true)
    expect(await verifyPassword(h, 'wrong')).toBe(false)
  })
})
