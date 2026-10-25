import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import {
  createSession,
  listSessions,
  resolveSession,
  revokeOtherSessions,
  revokeSession,
  revokeSessionById,
  sessionIdFor,
} from './session'
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
    const { rows } = await adminPool().query('select token_hash from sessions')
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toEqual(cookieValue)
  })

  it('does not resolve an expired session', async () => {
    const { cookieValue } = await createSession(userId, {})
    await adminPool().query("update sessions set expires_at = now() - interval '1 second'")
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve a revoked session', async () => {
    const { cookieValue } = await createSession(userId, {})
    await revokeSession(cookieValue)
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve a session for a disabled user', async () => {
    const { cookieValue } = await createSession(userId, {})
    await adminPool().query("update users set status = 'disabled' where id = $1", [userId])
    expect(await resolveSession(cookieValue)).toBeNull()
  })

  it('does not resolve an unknown cookie value', async () => {
    expect(await resolveSession('not-a-real-cookie')).toBeNull()
  })
})

describe('session management', () => {
  it('finds the session behind a cookie value', async () => {
    const a = await createSession(userId, { ip: '1.2.3.4' })
    const b = await createSession(fx.bob, {})

    const id = await sessionIdFor(a.cookieValue)
    expect(id).not.toBeNull()
    expect(await sessionIdFor('not-a-real-cookie')).toBeNull()

    const { rows } = await adminPool().query('select id from sessions where ip = $1', ['1.2.3.4'])
    expect(id).toBe(rows[0]?.id)
    expect(await sessionIdFor(b.cookieValue)).not.toBe(id)
  })

  it('lists only your own live sessions, newest first', async () => {
    await createSession(userId, { ip: '1.1.1.1' })
    await createSession(userId, { ip: '2.2.2.2' })
    await createSession(fx.bob, { ip: '3.3.3.3' })

    const mine = await listSessions(userId)

    expect(mine).toHaveLength(2)
    expect(mine.map((s) => s.ip)).toEqual(['2.2.2.2', '1.1.1.1'])
    expect(mine.every((s) => Boolean(s.id) && s.lastSeenAt instanceof Date)).toBe(true)
  })

  it('leaves another user’s session alone', async () => {
    const mine = await createSession(userId, {})
    const bob = await createSession(fx.bob, {})
    const bobId = await sessionIdFor(bob.cookieValue)

    expect(await revokeSessionById(userId, bobId ?? '')).toBe(false)
    expect(await resolveSession(bob.cookieValue)).not.toBeNull()
    expect(await revokeSessionById(userId, (await sessionIdFor(mine.cookieValue)) ?? '')).toBe(true)
    expect(await resolveSession(mine.cookieValue)).toBeNull()
  })

  it('signs out every other session and keeps the current one', async () => {
    const keep = await createSession(userId, {})
    const drop = await createSession(userId, {})
    const keepId = (await sessionIdFor(keep.cookieValue)) ?? ''

    await revokeOtherSessions(userId, keepId)

    expect(await resolveSession(keep.cookieValue)).not.toBeNull()
    expect(await resolveSession(drop.cookieValue)).toBeNull()
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
