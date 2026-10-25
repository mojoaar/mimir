import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool, appPool } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import { grantProject } from '../projects/access'
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  leaveTeam,
  listTeams,
  removeTeamMember,
  renameTeam,
} from './service'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

async function grantToTeam(projectId: string, teamId: string) {
  await adminPool().query(
    `insert into project_grants (project_id, principal_type, principal_id, role)
     values ($1, 'team', $2, 'read')`,
    [projectId, teamId],
  )
}

async function grantCount(projectId: string): Promise<number> {
  const { rows } = await adminPool().query<{ n: string }>(
    'select count(*)::text as n from project_grants where project_id = $1',
    [projectId],
  )
  return Number(rows[0]?.n ?? '0')
}

async function auditCount(action: string): Promise<number> {
  const { rows } = await adminPool().query<{ n: string }>(
    'select count(*)::text as n from audit_log where action = $1',
    [action],
  )
  return Number(rows[0]?.n ?? '0')
}

describe('teams', () => {
  it('names a team from its title and makes the creator the owner', async () => {
    const created = await createTeam(f.alice, 'Reading Notes')
    expect(created).toMatchObject({ slug: 'reading-notes', name: 'Reading Notes', role: 'owner' })

    const listed = await listTeams(f.alice)
    expect(listed.map((t) => t.slug)).toEqual(['reading-notes'])
    expect(listed[0]?.memberCount).toBe(1)

    const fetched = await getTeam(f.alice, created.id)
    expect(fetched?.members.map((m) => m.role)).toEqual(['owner'])
  })

  it('gives a second team with the same name its own slug', async () => {
    await createTeam(f.alice, 'notes')
    const second = await createTeam(f.alice, 'notes')
    expect(second.slug).toBe('notes-2')
  })

  it('hides a team from someone who is not in it', async () => {
    const team = await createTeam(f.alice, 'notes')

    expect(await getTeam(f.bob, team.id)).toBeNull()
    expect(await listTeams(f.bob)).toEqual([])

    await expect(addTeamMember(f.bob, team.id, 'carol@example.test')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('adds an active user once and tells the actor why not otherwise', async () => {
    const team = await createTeam(f.alice, 'notes')

    const added = await addTeamMember(f.alice, team.id, 'bob@example.test')
    expect(added.email).toBe('bob@example.test')
    expect(added.role).toBe('member')

    await expect(addTeamMember(f.alice, team.id, 'bob@example.test')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    await expect(addTeamMember(f.alice, team.id, 'nobody@example.test')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    await expect(addTeamMember(f.alice, team.id, 'disabled@example.test')).rejects.toMatchObject({
      code: 'invalid_params',
    })

    const fetched = await getTeam(f.alice, team.id)
    expect(fetched?.members).toHaveLength(2)
  })

  it('refuses to remove the last owner but removes a member and audits it', async () => {
    const team = await createTeam(f.alice, 'notes')
    await addTeamMember(f.alice, team.id, 'bob@example.test')

    await expect(removeTeamMember(f.alice, team.id, f.alice)).rejects.toMatchObject({
      code: 'invalid_params',
    })

    await removeTeamMember(f.alice, team.id, f.bob)
    const fetched = await getTeam(f.alice, team.id)
    expect(fetched?.members.map((m) => m.email)).toEqual(['alice@example.test'])
    expect(await auditCount('team.member_remove')).toBe(1)
  })

  it('revokes what a deleted team was sharing', async () => {
    const team = await createTeam(f.alice, 'notes')
    await grantToTeam(f.aliceProjectId, team.id)
    expect(await grantCount(f.aliceProjectId)).toBe(1)

    await deleteTeam(f.alice, team.id)

    expect(await grantCount(f.aliceProjectId)).toBe(0)
    expect(await listTeams(f.alice)).toEqual([])
    await expect(
      adminPool().query('select 1 from team_members where team_id = $1', [team.id]),
    ).resolves.toMatchObject({ rowCount: 0 })
  })

  it('refuses a delete from someone outside the team', async () => {
    const team = await createTeam(f.alice, 'notes')
    await expect(deleteTeam(f.bob, team.id)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await listTeams(f.alice)).toHaveLength(1)
  })

  it('keeps two teams with the same name apart', async () => {
    const alices = await createTeam(f.alice, 'platform')
    await addTeamMember(f.alice, alices.id, 'carol@example.test')
    const carols = await createTeam(f.carol, 'platform')

    const seenByCarol = await getTeam(f.carol, carols.id)
    expect(seenByCarol?.team.id).toBe(carols.id)
    expect(seenByCarol?.team.role).toBe('owner')

    const seenByAlice = await getTeam(f.alice, alices.id)
    expect(seenByAlice?.team.id).toBe(alices.id)
    expect(seenByAlice?.team.role).toBe('owner')
  })

  it('revokes grants on a project the team owner does not own', async () => {
    const team = await createTeam(f.bob, 'shared-ops')
    await addTeamMember(f.bob, team.id, 'alice@example.test')
    await grantProject(f.alice, f.aliceProjectId, 'team', team.id, 'read')
    expect(await grantCount(f.aliceProjectId)).toBe(1)

    await deleteTeam(f.bob, team.id)

    expect(await grantCount(f.aliceProjectId)).toBe(0)
  })

  it('lets a member leave without taking anyone else with them', async () => {
    const team = await createTeam(f.alice, 'notes')
    await addTeamMember(f.alice, team.id, 'bob@example.test')
    await addTeamMember(f.alice, team.id, 'carol@example.test')

    await leaveTeam(f.bob, team.id)

    expect(await listTeams(f.bob)).toHaveLength(0)
    const still = await getTeam(f.alice, team.id)
    expect(still?.members.map((m) => m.email).sort()).toEqual([
      'alice@example.test',
      'carol@example.test',
    ])
    expect(await auditCount('team.member_leave')).toBe(1)
  })

  it('refuses to let the last owner leave', async () => {
    const team = await createTeam(f.alice, 'notes')

    await expect(leaveTeam(f.alice, team.id)).rejects.toMatchObject({ code: 'invalid_params' })
    expect(await listTeams(f.alice)).toHaveLength(1)
  })

  it('answers not_found when someone who is not in the team tries to leave', async () => {
    const team = await createTeam(f.alice, 'notes')

    await expect(leaveTeam(f.bob, team.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('renames a team without moving it', async () => {
    const team = await createTeam(f.alice, 'notes')

    const renamed = await renameTeam(f.alice, team.id, '  Reading notes  ')

    expect(renamed.name).toBe('Reading notes')
    const fetched = await getTeam(f.alice, team.id)
    expect(fetched?.team).toMatchObject({ id: team.id, slug: team.slug, name: 'Reading notes' })
    expect(await auditCount('team.rename')).toBe(1)
  })

  it('refuses a rename from anyone but an owner, and a name that is too long', async () => {
    const team = await createTeam(f.alice, 'notes')
    await addTeamMember(f.alice, team.id, 'bob@example.test')

    await expect(renameTeam(f.bob, team.id, 'theirs')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(renameTeam(f.alice, team.id, 'a'.repeat(81))).rejects.toMatchObject({
      code: 'invalid_params',
    })
    await expect(renameTeam(f.alice, team.id, '   ')).rejects.toMatchObject({
      code: 'invalid_params',
    })
  })
})
