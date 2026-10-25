import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { createSession, resolveSession } from '@/lib/auth/session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { resetLoginRateLimit } from '@/lib/auth/rate-limit'
import { changePassword, listMySessions, revokeOwnSession, updateProfile } from './self'

const CORRECT = 'correct-password'
const NEW_PASSWORD = 'a-brand-new-pass'

let fixtures: Fixtures

beforeEach(async () => {
  resetLoginRateLimit()
  await resetFixtures()
  fixtures = await seedTwoUsersWithProjects()
})

async function emailOf(userId: string): Promise<string> {
  const result = await adminPool().query<{ email: string }>(
    'select email::text as email from users where id = $1',
    [userId],
  )
  return result.rows[0]?.email ?? ''
}

async function hashOf(userId: string): Promise<string> {
  const result = await adminPool().query<{ password_hash: string | null }>(
    'select password_hash from users where id = $1',
    [userId],
  )
  return result.rows[0]?.password_hash ?? ''
}

async function audits(action: string): Promise<number> {
  const result = await adminPool().query<{ n: string }>(
    'select count(*)::text as n from audit_log where action = $1',
    [action],
  )
  return Number(result.rows[0]?.n ?? 0)
}

describe('editing your own profile', () => {
  it('saves a trimmed name', async () => {
    const profile = await updateProfile(fixtures.alice, { name: '  Alice Cooper  ' })

    expect(profile.name).toBe('Alice Cooper')
    expect(await audits('auth.profile_update')).toBe(1)
  })

  it('saves a new email when the current password is right', async () => {
    const profile = await updateProfile(fixtures.alice, {
      email: 'New.Address@Example.test',
      currentPassword: CORRECT,
    })

    expect(profile.email).toBe('new.address@example.test')
    expect(await emailOf(fixtures.alice)).toBe('new.address@example.test')
  })

  it('refuses an email change without the current password', async () => {
    const before = await emailOf(fixtures.alice)

    await expect(
      updateProfile(fixtures.alice, { email: 'other@example.test', currentPassword: 'wrong' }),
    ).rejects.toMatchObject({ code: 'invalid_params' })

    expect(await emailOf(fixtures.alice)).toBe(before)
  })

  it('refuses an email another account already uses, in any case', async () => {
    await expect(
      updateProfile(fixtures.alice, {
        email: 'BOB@example.test',
        currentPassword: CORRECT,
      }),
    ).rejects.toMatchObject({ code: 'invalid_params' })

    expect(await emailOf(fixtures.alice)).not.toBe('bob@example.test')
  })

  it('refuses a blank name', async () => {
    await expect(updateProfile(fixtures.alice, { name: '   ' })).rejects.toMatchObject({
      code: 'invalid_params',
    })
  })
})

describe('changing your own password', () => {
  it('refuses a wrong current password', async () => {
    const before = await hashOf(fixtures.alice)

    await expect(
      changePassword(fixtures.alice, 'not-the-password', NEW_PASSWORD, 'session-a'),
    ).rejects.toMatchObject({ code: 'invalid_params' })

    expect(await hashOf(fixtures.alice)).toBe(before)
  })

  it('refuses a new password that is too short', async () => {
    await expect(
      changePassword(fixtures.alice, CORRECT, 'too-short', 'session-a'),
    ).rejects.toMatchObject({ code: 'invalid_params' })
  })

  it('saves the new password and signs out every other session', async () => {
    const current = await createSession(fixtures.alice, { ip: '1.1.1.1' })
    const other = await createSession(fixtures.alice, { ip: '2.2.2.2' })
    const currentId = (await listMySessions(fixtures.alice, '')).find(
      (session) => session.ip === '1.1.1.1',
    )?.id
    if (!currentId) throw new Error('the current session was not listed')

    await changePassword(fixtures.alice, CORRECT, NEW_PASSWORD, currentId)

    expect(await verifyPassword(await hashOf(fixtures.alice), NEW_PASSWORD)).toBe(true)
    expect(await resolveSession(current.cookieValue)).not.toBeNull()
    expect(await resolveSession(other.cookieValue)).toBeNull()
    expect(await audits('auth.password_change')).toBe(1)
  })

  it('names the reset link for an account with no password', async () => {
    await adminPool().query('update users set password_hash = null where id = $1', [
      fixtures.alice,
    ])

    await expect(
      changePassword(fixtures.alice, CORRECT, NEW_PASSWORD, 'session-a'),
    ).rejects.toMatchObject({ code: 'invalid_params' })
  })
})

describe('your own sessions', () => {
  it('marks the one you are on', async () => {
    const current = await createSession(fixtures.alice, { ip: '1.1.1.1' })
    await createSession(fixtures.alice, { ip: '2.2.2.2' })
    const id = (await listMySessions(fixtures.alice, '')).find(
      (session) => session.ip === '1.1.1.1',
    )?.id
    if (!id) throw new Error('the current session was not listed')

    const mine = await listMySessions(fixtures.alice, id)

    expect(mine.filter((session) => session.current)).toHaveLength(1)
    expect(mine.find((session) => session.current)?.id).toBe(id)
    expect(current.cookieValue).toBeTruthy()
  })

  it('revokes one you own and refuses someone else’s', async () => {
    const mine = await createSession(fixtures.alice, { ip: '1.1.1.1' })
    const bob = await createSession(fixtures.bob, { ip: '9.9.9.9' })
    const myId = (await listMySessions(fixtures.alice, '')).find(
      (session) => session.ip === '1.1.1.1',
    )?.id
    const bobId = (await listMySessions(fixtures.bob, '')).find(
      (session) => session.ip === '9.9.9.9',
    )?.id
    if (!myId || !bobId) throw new Error('a session was not listed')

    await revokeOwnSession(fixtures.alice, myId)
    expect(await resolveSession(mine.cookieValue)).toBeNull()

    await expect(revokeOwnSession(fixtures.alice, bobId)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(await resolveSession(bob.cookieValue)).not.toBeNull()
  })
})

describe('guessing the current password', () => {
  it('is refused once too many guesses have failed', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        changePassword(fixtures.alice, 'not-the-password', NEW_PASSWORD, 'session'),
      ).rejects.toMatchObject({ code: 'invalid_params' })
    }

    await expect(
      changePassword(fixtures.alice, CORRECT, NEW_PASSWORD, 'session'),
    ).rejects.toThrow(/too many attempts/)
  })
})

describe('the case of an email address', () => {
  it('accepts a differently cased address and stores it in lower case', async () => {
    const saved = await updateProfile(fixtures.alice, {
      email: 'ALICE@example.test',
      currentPassword: CORRECT,
    })

    expect(saved.email).toBe('alice@example.test')
    expect(await emailOf(fixtures.alice)).toBe('alice@example.test')
  })
})
