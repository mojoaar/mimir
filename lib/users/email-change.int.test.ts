import { beforeEach, describe, expect, it } from 'vitest'

import { adminPool } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import { sha256 } from '../crypto'
import { createSession, resolveSession } from '../auth/session'
import { confirmEmailChange, confirmEmailUrl, requestEmailChange } from './email-change'

let fx: Fixtures

beforeEach(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
})

async function pending(userId: string) {
  const { rows } = await adminPool().query<{ email: string; token_hash: Buffer; expires_at: Date }>(
    `select email, token_hash, expires_at from email_changes
      where user_id = $1 and used_at is null
      order by created_at desc limit 1`,
    [userId],
  )
  return rows[0]
}

async function createChange(userId: string, email: string, token: string, expires = '60 minutes') {
  await adminPool().query(
    `insert into email_changes (user_id, email, token_hash, expires_at)
     values ($1, $2, $3, now() + $4::interval)`,
    [userId, email, sha256(token), expires],
  )
}

async function emailOf(userId: string) {
  const { rows } = await adminPool().query<{ email: string }>(
    'select email::text as email from users where id = $1',
    [userId],
  )
  return rows[0]?.email
}

describe('changing an email address', () => {
  it('records the request without touching the account', async () => {
    await requestEmailChange(fx.alice, 'alice.new@example.test', fx.correctPassword)

    expect(await emailOf(fx.alice)).toBe('alice@example.test')
    const row = await pending(fx.alice)
    if (!row) throw new Error('no pending change was written')
    expect(row.email).toBe('alice.new@example.test')
    expect(row.token_hash).toHaveLength(32)
    // An hour, near enough that a clock skew of a minute does not matter.
    const minutes = (row.expires_at.getTime() - Date.now()) / 60000
    expect(minutes).toBeGreaterThan(58)
    expect(minutes).toBeLessThan(62)
  })

  it('confirms the address, spends the link and ends every session', async () => {
    const first = await createSession(fx.alice, {})
    await createSession(fx.alice, {})
    await createChange(fx.alice, 'alice.new@example.test', 'a-token')

    const result = await confirmEmailChange('a-token')

    expect(result.email).toBe('alice.new@example.test')
    expect(await emailOf(fx.alice)).toBe('alice.new@example.test')
    expect(await pending(fx.alice)).toBeUndefined()
    expect(await resolveSession(first.cookieValue)).toBeNull()
  })

  it('works without a session, because the inbox is not the browser', async () => {
    await createChange(fx.alice, 'alice.new@example.test', 'signed-out-token')

    // No user context is established here at all: the lookup runs on the
    // admin pool, which is the whole point of the test.
    await expect(confirmEmailChange('signed-out-token')).resolves.toEqual({
      email: 'alice.new@example.test',
    })
  })

  it('refuses a link that was already used or has expired', async () => {
    await createChange(fx.alice, 'alice.new@example.test', 'once', '1 hour')
    await confirmEmailChange('once')
    await expect(confirmEmailChange('once')).rejects.toThrow('no longer valid')

    await createChange(fx.alice, 'alice.new@example.test', 'stale', '-1 hour')
    await expect(confirmEmailChange('stale')).rejects.toThrow('no longer valid')
  })

  it('refuses an address another account already uses', async () => {
    await expect(
      requestEmailChange(fx.alice, 'bob@example.test', fx.correctPassword),
    ).rejects.toThrow('already in use')
  })

  it('asks for the right password before it mails anything', async () => {
    await expect(
      requestEmailChange(fx.alice, 'alice.new@example.test', 'not-the-password'),
    ).rejects.toThrow('your current password is wrong')
    expect(await adminPool().query('select 1 from email_changes')).toMatchObject({ rowCount: 0 })
  })

  it('puts the token in the fragment, so it stays out of the request line', () => {
    expect(confirmEmailUrl('https://mimir.test/', 'abc')).toBe('https://mimir.test/confirm-email#abc')
  })
})
