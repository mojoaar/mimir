import { withAdmin } from '@/lib/db/tx'
import { hashPassword } from '@/lib/auth/password'
import { revokeAllSessions } from '@/lib/auth/session'
import { mintToken } from '@/lib/auth/tokens'
import { audit } from '@/lib/audit'

export type UserStatus = 'pending' | 'active' | 'disabled'
export type UserRole = 'admin' | 'user'

export type AdminUser = {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  mfaEnabled: boolean
  lastLoginAt: Date | null
  createdAt: Date
  projectCount: number
}

type ServiceError = Error & { code: 'forbidden' | 'invalid_params' | 'not_found' }

function fail(code: ServiceError['code'], message: string): ServiceError {
  const error = new Error(message) as ServiceError
  error.code = code
  return error
}

type Row = {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  mfa_enabled: boolean
  last_login_at: Date | null
  created_at: Date
  project_count: string | number
}

const SELECT_USER = `
  select u.id, u.email::text as email, u.name, u.role, u.status,
         (u.totp_secret_enc is not null) as mfa_enabled,
         u.last_login_at, u.created_at,
         (select count(*) from projects p where p.owner_user_id = u.id) as project_count
    from users u`

function toUser(row: Row): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mfaEnabled: row.mfa_enabled,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    projectCount: Number(row.project_count),
  }
}

export async function listUsers(input: {
  query?: string
  status?: UserStatus
  limit?: number
  offset?: number
} = {}): Promise<{ rows: AdminUser[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const offset = Math.max(input.offset ?? 0, 0)
  const query = input.query?.trim() ?? ''
  const pattern = query ? `%${query}%` : null

  return withAdmin(async (client) => {
    const { rows: counted } = await client.query<{ total: string }>(
      `select count(*)::text as total from users u
        where ($1::text is null or u.email::text ilike $1 or u.name ilike $1)
          and ($2::user_status is null or u.status = $2)`,
      [pattern, input.status ?? null],
    )
    const { rows } = await client.query<Row>(
      `${SELECT_USER}
        where ($1::text is null or u.email::text ilike $1 or u.name ilike $1)
          and ($2::user_status is null or u.status = $2)
        order by u.created_at, u.email
        limit $3 offset $4`,
      [pattern, input.status ?? null, limit, offset],
    )
    return { rows: rows.map(toUser), total: Number(counted[0]?.total ?? 0) }
  })
}

export async function getUser(userId: string): Promise<AdminUser | null> {
  return withAdmin(async (client) => {
    const { rows } = await client.query<Row>(`${SELECT_USER} where u.id = $1`, [userId])
    const row = rows[0]
    return row ? toUser(row) : null
  })
}

export async function countAdmins(): Promise<number> {
  return withAdmin(async (client) => {
    const { rows } = await client.query<{ total: string }>(
      "select count(*)::text as total from users where role = 'admin' and status = 'active'",
    )
    return Number(rows[0]?.total ?? 0)
  })
}

async function target(client: import('pg').PoolClient, userId: string) {
  const { rows } = await client.query<{
    id: string
    email: string
    role: UserRole
    status: UserStatus
  }>('select id, email::text as email, role, status from users where id = $1', [userId])
  const row = rows[0]
  if (!row) throw fail('not_found', 'No such user.')
  return row
}

async function activeAdmins(client: import('pg').PoolClient): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    "select count(*)::text as total from users where role = 'admin' and status = 'active'",
  )
  return Number(rows[0]?.total ?? 0)
}

// Refuse anything that would leave the install without an admin who can sign in.
async function guardLastAdmin(client: import('pg').PoolClient, userId: string): Promise<void> {
  const row = await target(client, userId)
  if (row.role !== 'admin' || row.status !== 'active') return
  if ((await activeAdmins(client)) <= 1) {
    throw fail('forbidden', 'This is the only admin. Promote another user first.')
  }
}

export async function verifyUser(actorId: string, userId: string): Promise<void> {
  await withAdmin(async (client) => {
    const row = await target(client, userId)
    if (row.status !== 'pending') return
    await client.query("update users set status = 'active' where id = $1", [userId])
    await audit(
      { actorType: 'user', actorId, action: 'admin.user_verify', targetType: 'user', targetId: userId },
      client,
    )
  })
}

export async function enableUser(actorId: string, userId: string): Promise<void> {
  await withAdmin(async (client) => {
    const row = await target(client, userId)
    if (row.status === 'active') return
    await client.query("update users set status = 'active' where id = $1", [userId])
    await audit(
      { actorType: 'user', actorId, action: 'admin.user_enable', targetType: 'user', targetId: userId },
      client,
    )
  })
}

export async function disableUser(actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw fail('forbidden', 'You cannot disable your own account.')

  await withAdmin(async (client) => {
    const row = await target(client, userId)
    await guardLastAdmin(client, userId)
    if (row.status === 'disabled') return

    await client.query("update users set status = 'disabled' where id = $1", [userId])
    // A status change alone is cosmetic: an existing cookie or key keeps working.
    await revokeAllSessions(userId, client)
    await client.query(
      'update api_keys set revoked_at = now() where user_id = $1 and revoked_at is null',
      [userId],
    )
    await audit(
      { actorType: 'user', actorId, action: 'admin.user_disable', targetType: 'user', targetId: userId },
      client,
    )
  })
}

export async function createUser(
  actorId: string,
  input: { email: string; name: string; role: UserRole; password?: string },
): Promise<{ id: string; inviteToken: string | null }> {
  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw fail('invalid_params', 'That is not an email address.')
  if (!input.name.trim()) throw fail('invalid_params', 'A name is required.')

  const passwordHash = input.password ? await hashPassword(input.password) : null

  const id = await withAdmin(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into users (email, name, password_hash, status, role)
       values ($1, $2, $3, 'active', $4)
       returning id`,
      [email, input.name.trim(), passwordHash, input.role],
    )
    const created = rows[0]
    if (!created) throw fail('invalid_params', 'That email is already in use.')
    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'admin.user_create',
        targetType: 'user',
        targetId: created.id,
        detail: { role: input.role, invited: passwordHash === null },
      },
      client,
    )
    return created.id
  }).catch((error: unknown) => {
    if ((error as { code?: string }).code === '23505') {
      throw fail('invalid_params', 'That email is already in use.')
    }
    throw error
  })

  if (passwordHash) return { id, inviteToken: null }

  const { token } = await mintToken(id, 'invite', actorId)
  return { id, inviteToken: token }
}

export async function setUserRole(actorId: string, userId: string, role: UserRole): Promise<void> {
  await withAdmin(async (client) => {
    const row = await target(client, userId)
    if (row.role === role) return
    if (role === 'user') await guardLastAdmin(client, userId)

    await client.query('update users set role = $2 where id = $1', [userId, role])
    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'admin.user_role_change',
        targetType: 'user',
        targetId: userId,
        detail: { from: row.role, to: role },
      },
      client,
    )
  })
}

export async function resetMfaForUser(actorId: string, userId: string): Promise<void> {
  await withAdmin(async (client) => {
    await target(client, userId)
    await client.query(
      'update users set totp_secret_enc = null, totp_pending_enc = null, totp_last_step = null where id = $1',
      [userId],
    )
    await revokeAllSessions(userId, client)
    await audit(
      { actorType: 'user', actorId, action: 'admin.mfa_reset', targetType: 'user', targetId: userId },
      client,
    )
  })
}

export async function deleteUser(actorId: string, userId: string, confirmEmail: string): Promise<void> {
  if (actorId === userId) throw fail('forbidden', 'You cannot delete your own account.')

  await withAdmin(async (client) => {
    const row = await target(client, userId)
    await guardLastAdmin(client, userId)
    if (confirmEmail.trim().toLowerCase() !== row.email.toLowerCase()) {
      throw fail('invalid_params', 'Type the email address exactly to confirm.')
    }

    await client.query('delete from users where id = $1', [userId])
    await audit(
      { actorType: 'user', actorId, action: 'admin.user_delete', targetType: 'user', targetId: userId },
      client,
    )
  })
}
