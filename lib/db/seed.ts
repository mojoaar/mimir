import { randomUUID } from 'node:crypto'
import { adminPool } from './pool'

export type Fixtures = {
  alice: string
  bob: string
  carol: string
  admin: string
  aliceProjectId: string
}

/** Truncate every data table, so a test starts from a known empty state. */
export async function resetFixtures(): Promise<void> {
  await adminPool.query(`
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
  for (const [id, email, name, role] of people) {
    await adminPool.query(
      `insert into users (id, email, name, status, role) values ($1, $2, $3, 'active', $4)`,
      [id, email, name, role],
    )
  }

  const aliceProjectId = randomUUID()
  await adminPool.query(
    `insert into projects (id, owner_user_id, name, slug) values ($1, $2, 'Alice Project', 'alice-project')`,
    [aliceProjectId, alice],
  )
  await adminPool.query(
    `insert into projects (owner_user_id, name, slug) values ($1, 'Bob Project', 'bob-project')`,
    [bob],
  )

  return { alice, bob, carol, admin, aliceProjectId }
}

/** A grant seeded without going through the access service. */
export async function seedGrant(
  projectId: string,
  userId: string,
  role: 'read' | 'write',
): Promise<void> {
  await adminPool.query(
    `insert into project_grants (project_id, principal_type, principal_id, role)
     values ($1, 'user', $2, $3)
     on conflict (project_id, principal_type, principal_id) do update set role = excluded.role`,
    [projectId, userId, role],
  )
}
