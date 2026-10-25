import { beforeEach, describe, expect, it } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { createSession, resolveSession } from '@/lib/auth/session'
import { createApiKey, resolveApiKey } from '@/lib/auth/apikey'
import { verifyPassword } from '@/lib/auth/password'
import { adminPool } from '@/lib/db/pool'
import {
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  getUser,
  listUsers,
  resetMfaForUser,
  setUserRole,
  verifyUser,
  countAdmins,
} from './service'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

async function statusOf(userId: string): Promise<string> {
  const { rows } = await adminPool().query('select status from users where id = $1', [userId])
  return rows[0].status
}

describe('disabling a user', () => {
  it('revokes their sessions and api keys in the same transaction', async () => {
    const session = await createSession(f.alice, {})
    const key = await createApiKey(f.alice, 'agent')

    await disableUser(f.admin, f.alice)

    expect(await resolveSession(session.cookieValue)).toBeNull()
    expect(await resolveApiKey(key.token)).toBeNull()
    expect(await statusOf(f.alice)).toBe('disabled')
  })

  it('refuses to disable the caller', async () => {
    await expect(disableUser(f.admin, f.admin)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await statusOf(f.admin)).toBe('active')
  })

  it('refuses to disable the last active admin', async () => {
    await expect(disableUser(f.alice, f.admin)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await statusOf(f.admin)).toBe('active')
  })
})

describe('roles', () => {
  it('refuses to demote the last admin', async () => {
    await setUserRole(f.admin, f.bob, 'admin')
    expect(await countAdmins()).toBe(2)
    await disableUser(f.admin, f.bob)

    await expect(setUserRole(f.admin, f.admin, 'user')).rejects.toMatchObject({ code: 'forbidden' })
    const { rows } = await adminPool().query('select role from users where id = $1', [f.admin])
    expect(rows[0].role).toBe('admin')
  })

  it('promotes a user', async () => {
    await setUserRole(f.admin, f.alice, 'admin')
    expect(await countAdmins()).toBe(2)
    expect((await getUser(f.alice))?.role).toBe('admin')
  })
})

describe('creating users', () => {
  it('creates an active user who can sign in with the given password', async () => {
    const { id, inviteToken } = await createUser(f.admin, {
      email: 'new@example.test',
      name: 'New Person',
      role: 'user',
      password: 'a-long-password',
    })

    expect(inviteToken).toBeNull()
    expect(await statusOf(id)).toBe('active')
    const { rows } = await adminPool().query('select password_hash from users where id = $1', [id])
    expect(await verifyPassword(rows[0].password_hash, 'a-long-password')).toBe(true)
  })

  it('creates an active user with an invite token when no password is given', async () => {
    const { id, inviteToken } = await createUser(f.admin, {
      email: 'invited@example.test',
      name: 'Invited',
      role: 'user',
    })

    expect(await statusOf(id)).toBe('active')
    expect(inviteToken).toBeTruthy()
    const { rows } = await adminPool().query('select kind, used_at from tokens where user_id = $1', [id])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('invite')
    expect(rows[0].used_at).toBeNull()
  })
})

describe('deleting users', () => {
  it('requires the email to be typed back', async () => {
    await expect(deleteUser(f.admin, f.bob, 'wrong@example.test')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await getUser(f.bob)).not.toBeNull()
  })

  it('refuses to delete the caller', async () => {
    await expect(deleteUser(f.admin, f.admin, 'admin@example.test')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('account state', () => {
  it('verifies a pending user and lets them sign in afterwards', async () => {
    const { rows } = await adminPool().query(
      "select id from users where status = 'pending' limit 1",
    )
    const pendingId = rows[0].id

    await verifyUser(f.admin, pendingId)

    expect(await statusOf(pendingId)).toBe('active')
  })

  it('re-enables a disabled user', async () => {
    await disableUser(f.admin, f.alice)
    await enableUser(f.admin, f.alice)
    expect(await statusOf(f.alice)).toBe('active')
  })

  it('clears the totp secret and revokes sessions on mfa reset', async () => {
    const session = await createSession(f.alice, {})
    await adminPool().query(
      "update users set totp_secret_enc = '\\x00'::bytea, totp_last_step = 5 where id = $1",
      [f.alice],
    )

    await resetMfaForUser(f.admin, f.alice)

    expect(await resolveSession(session.cookieValue)).toBeNull()
    const { rows } = await adminPool().query(
      'select totp_secret_enc, totp_last_step from users where id = $1',
      [f.alice],
    )
    expect(rows[0]?.totp_secret_enc).toBeNull()
    expect(rows[0]?.totp_last_step).toBeNull()
  })
})

describe('listing users', () => {
  it('filters by a fragment of the email', async () => {
    const { rows, total } = await listUsers({ query: 'ali' })
    expect(total).toBe(1)
    expect(rows[0]?.email).toContain('ali')
  })

  it('filters by status', async () => {
    const { rows } = await listUsers({ status: 'pending' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.status === 'pending')).toBe(true)
  })

  it('counts the projects a user owns', async () => {
    const { rows } = await listUsers({ query: 'alice' })
    expect(rows[0]?.projectCount).toBe(1)
  })
})

describe('auditing', () => {
  it('records one row per mutation with the user id as target', async () => {
    await disableUser(f.admin, f.alice)

    const { rows } = await adminPool().query(
      "select action, target_type, target_id from audit_log where action like 'admin.%'",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('admin.user_disable')
    expect(rows[0].target_type).toBe('user')
    expect(rows[0].target_id).toBe(f.alice)
  })
})
