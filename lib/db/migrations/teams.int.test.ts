import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, appPool } from '../pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../seed'

afterAll(async () => {
  await adminPool().end()
})

let f: Fixtures
let teamId: string

/** Run a statement as the app role with mimir.user_id set, inside a rolled-back transaction. */
async function asUser<T>(
  userId: string,
  fn: (run: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<T>,
): Promise<T> {
  const client = await appPool().connect()
  try {
    await client.query('begin')
    await client.query("select set_config('mimir.user_id', $1, true)", [userId])
    return await fn((sql, params) => client.query(sql, params as never))
  } finally {
    await client.query('rollback').catch(() => undefined)
    client.release()
  }
}

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()

  const team = await adminPool().query<{ id: string }>(
    `insert into teams (owner_user_id, name, slug) values ($1, 'Design', 'design') returning id`,
    [f.alice],
  )
  teamId = team.rows[0]?.id ?? ''
  await adminPool().query(
    `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [teamId, f.alice, f.bob],
  )
})

async function grantToTeam(role: 'read' | 'write') {
  await adminPool().query(
    `insert into project_grants (project_id, principal_type, principal_id, role)
     values ($1, 'team', $2, $3)`,
    [f.aliceProjectId, teamId, role],
  )
}

describe('teams under row level security', () => {
  it('hides a team and its members from someone who is not in it', async () => {
    const teams = await asUser(f.carol, (run) => run('select id from teams'))
    expect(teams.rows).toEqual([])

    const members = await asUser(f.carol, (run) => run('select user_id from team_members'))
    expect(members.rows).toEqual([])
  })

  it('shows the team and its members to a member', async () => {
    const teams = await asUser(f.bob, (run) => run('select slug from teams'))
    expect(teams.rows).toEqual([{ slug: 'design' }])

    const members = await asUser(f.bob, (run) => run('select user_id from team_members order by role'))
    expect(members.rows).toHaveLength(2)
  })

  it('gives a member read access to a project shared with the team', async () => {
    await grantToTeam('read')

    const access = await asUser(f.bob, (run) =>
      run('select can_access_project($1) as can_read, can_write_project($1) as can_write', [
        f.aliceProjectId,
      ]),
    )
    expect(access.rows).toEqual([{ can_read: true, can_write: false }])

    const projects = await asUser(f.bob, (run) =>
      run('select id from projects where id = $1', [f.aliceProjectId]),
    )
    expect(projects.rows).toHaveLength(1)
  })

  it('lets a member write when the team grant says write', async () => {
    await grantToTeam('write')

    const access = await asUser(f.bob, (run) =>
      run('select can_access_project($1) as can_read, can_write_project($1) as can_write', [
        f.aliceProjectId,
      ]),
    )
    expect(access.rows).toEqual([{ can_read: true, can_write: true }])
  })

  it('does not make a team member an owner', async () => {
    await grantToTeam('write')

    const owner = await asUser(f.bob, (run) =>
      run('select owns_project($1) as owns', [f.aliceProjectId]),
    )
    expect(owner.rows).toEqual([{ owns: false }])

    const renamed = await asUser(f.bob, (run) =>
      run(`update projects set name = 'hijacked' where id = $1 returning id`, [f.aliceProjectId]),
    )
    expect(renamed.rows).toEqual([])

    // A failing INSERT policy raises rather than returning no rows.
    await expect(
      asUser(f.bob, (run) =>
        run(
          `insert into project_grants (project_id, principal_type, principal_id, role)
           values ($1, 'user', $2, 'write') returning id`,
          [f.aliceProjectId, f.carol],
        ),
      ),
    ).rejects.toThrow(/row-level security/)
  })
})
