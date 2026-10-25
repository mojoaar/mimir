import { randomUUID } from 'node:crypto'
import { hashPassword } from '../auth/password'
import { adminPool } from './pool'

export type Fixtures = {
  alice: string
  bob: string
  carol: string
  admin: string
  aliceProjectId: string
  email: string
  correctPassword: string
  pendingEmail: string
  disabledEmail: string
}

export const TEST_PASSWORD = 'correct-password'

let cachedHash: string | null = null

// argon2 is deliberately slow; hashing four users per reset would dominate the
// suite, and every seeded user shares one password anyway.
async function passwordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await hashPassword(TEST_PASSWORD)
  return cachedHash
}

/** Truncate every data table, so a test starts from a known empty state. */
export async function resetFixtures(): Promise<void> {
  await adminPool().query(`
    truncate users, projects, project_grants, memories, sessions, api_keys,
             providers, tokens, audit_log, backup_runs, settings
    restart identity cascade
  `)
}

/**
 * Four users: two with their own project, one with none (the "stranger"), and
 * one admin. The admin owns no project on purpose — being an admin must not
 * grant read access to anyone's memory.
 */
export async function seedTwoUsersWithProjects(): Promise<Fixtures> {
  const alice = randomUUID()
  const bob = randomUUID()
  const carol = randomUUID()
  const admin = randomUUID()

  const people: Array<[string, string, string, string]> = [
    [alice, 'alice@example.test', 'Alice', 'user'],
    [bob, 'bob@example.test', 'Bob', 'user'],
    [carol, 'carol@example.test', 'Carol', 'user'],
    [admin, 'admin@example.test', 'Admin', 'admin'],
  ]
  const hash = await passwordHash()
  for (const [id, email, name, role] of people) {
    await adminPool().query(
      `insert into users (id, email, name, password_hash, status, role)
       values ($1, $2, $3, $4, 'active', $5)`,
      [id, email, name, hash, role],
    )
  }

  // Two accounts that exist but may not sign in, for the login state machine.
  for (const [email, status] of [
    ['pending@example.test', 'pending'],
    ['disabled@example.test', 'disabled'],
  ] as const) {
    await adminPool().query(
      `insert into users (email, name, password_hash, status, role)
       values ($1, $2, $3, $4, 'user')`,
      [email, status, hash, status],
    )
  }

  const aliceProjectId = randomUUID()
  await adminPool().query(
    `insert into projects (id, owner_user_id, name, slug) values ($1, $2, 'Alice Project', 'alice-project')`,
    [aliceProjectId, alice],
  )
  await adminPool().query(
    `insert into projects (owner_user_id, name, slug) values ($1, 'Bob Project', 'bob-project')`,
    [bob],
  )

  return {
    alice,
    bob,
    carol,
    admin,
    aliceProjectId,
    email: 'alice@example.test',
    correctPassword: TEST_PASSWORD,
    pendingEmail: 'pending@example.test',
    disabledEmail: 'disabled@example.test',
  }
}

/** A grant seeded without going through the access service. */
export async function seedGrant(
  projectId: string,
  userId: string,
  role: 'read' | 'write',
): Promise<void> {
  await adminPool().query(
    `insert into project_grants (project_id, principal_type, principal_id, role)
     values ($1, 'user', $2, $3)
     on conflict (project_id, principal_type, principal_id) do update set role = excluded.role`,
    [projectId, userId, role],
  )
}
