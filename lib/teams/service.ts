import type { PoolClient } from 'pg'

import { audit } from '@/lib/audit'
import { withUser } from '@/lib/db/tx'
import { slugify } from '@/lib/slug'

export type TeamRole = 'owner' | 'member'

export type TeamSummary = {
  id: string
  slug: string
  name: string
  role: TeamRole
  memberCount: number
}

export type TeamMember = { userId: string; email: string; name: string; role: TeamRole }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(code: 'forbidden' | 'invalid_params' | 'not_found', message: string) {
  const error = new Error(message) as Error & { code: typeof code }
  error.code = code
  return error
}

async function requireTeamOwner(client: PoolClient, actorId: string, teamId: string) {
  const { rows } = await client.query<{ role: TeamRole }>(
    'select role from team_members where team_id = $1 and user_id = $2',
    [teamId, actorId],
  )
  const role = rows[0]?.role
  if (role !== 'owner') throw fail('forbidden', 'only a team owner can do that')
}

/**
 * A team is a sharing group, not a second owner. Everything here is scoped by
 * the caller's own membership, and RLS hides a team from everyone else.
 */
export async function createTeam(userId: string, name: string): Promise<TeamSummary> {
  const trimmed = name.trim()
  if (!trimmed) throw fail('invalid_params', 'a team needs a name')
  const base = slugify(trimmed)

  return withUser(userId, async (client) => {
    const slug = await insertTeam(client, userId, trimmed, base)
    await client.query(
      `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`,
      [slug.id, userId],
    )
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'team.create',
        targetType: 'team',
        targetId: slug.id,
        detail: { slug: slug.slug },
      },
      client,
    )
    return { ...slug, role: 'owner' as const, memberCount: 1 }
  })
}

async function insertTeam(
  client: PoolClient,
  userId: string,
  name: string,
  base: string,
): Promise<{ id: string; slug: string; name: string }> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    const { rows } = await client.query<{ id: string }>(
      `insert into teams (owner_user_id, name, slug) values ($1, $2, $3)
       on conflict (owner_user_id, slug) do nothing
       returning id`,
      [userId, name, slug],
    )
    const row = rows[0]
    if (row) return { id: row.id, slug, name }
  }
  throw fail('invalid_params', 'you already have too many teams with that name')
}

export async function listTeams(userId: string): Promise<TeamSummary[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<TeamSummary>(
      `select t.id, t.slug, t.name, m.role,
              (select count(*)::int from team_members x where x.team_id = t.id) as "memberCount"
         from teams t
         join team_members m on m.team_id = t.id and m.user_id = $1
        order by t.name, t.slug`,
      [userId],
    )
    return rows
  })
}

export async function getTeam(
  userId: string,
  teamId: string,
): Promise<{ team: TeamSummary; members: TeamMember[] } | null> {
  // The route passes whatever is in the URL; a non-uuid would make Postgres
  // raise 22P02 instead of a 404.
  if (!UUID.test(teamId)) return null
  return withUser(userId, async (client) => {
    const found = await client.query<TeamSummary>(
      `select t.id, t.slug, t.name, m.role,
              (select count(*)::int from team_members x where x.team_id = t.id) as "memberCount"
         from teams t
         join team_members m on m.team_id = t.id and m.user_id = $1
        where t.id = $2`,
      [userId, teamId],
    )
    const team = found.rows[0]
    if (!team) return null

    const members = await client.query<TeamMember>(
      `select u.id as "userId", u.email, u.name, m.role
         from team_members m
         join users u on u.id = m.user_id
        where m.team_id = $1
        order by (m.role = 'owner') desc, u.email`,
      [team.id],
    )
    return { team, members: members.rows }
  })
}

export async function addTeamMember(
  actorId: string,
  teamId: string,
  email: string,
): Promise<TeamMember> {
  return withUser(actorId, async (client) => {
    await requireTeamOwner(client, actorId, teamId)

    const found = await client.query<{ id: string; email: string; name: string }>(
      `select id, email, name from users where email = $1 and status = 'active'`,
      [email.trim()],
    )
    const user = found.rows[0]
    if (!user) throw fail('invalid_params', 'no active user with that email')

    const added = await client.query(
      `insert into team_members (team_id, user_id, role) values ($1, $2, 'member')
       on conflict (team_id, user_id) do nothing
       returning user_id`,
      [teamId, user.id],
    )
    if (added.rowCount === 0) throw fail('invalid_params', 'that person is already in this team')

    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'team.member_add',
        targetType: 'team',
        targetId: teamId,
        detail: { userId: user.id },
      },
      client,
    )
    return { userId: user.id, email: user.email, name: user.name, role: 'member' as const }
  })
}

export async function removeTeamMember(
  actorId: string,
  teamId: string,
  userId: string,
): Promise<void> {
  return withUser(actorId, async (client) => {
    await requireTeamOwner(client, actorId, teamId)

    const target = await client.query<{ role: TeamRole }>(
      'select role from team_members where team_id = $1 and user_id = $2',
      [teamId, userId],
    )
    const role = target.rows[0]?.role
    if (!role) throw fail('not_found', 'that person is not in this team')

    if (role === 'owner') {
      const owners = await client.query<{ n: string }>(
        `select count(*)::text as n from team_members where team_id = $1 and role = 'owner'`,
        [teamId],
      )
      if (Number(owners.rows[0]?.n ?? '0') <= 1) throw fail('invalid_params', 'a team needs an owner')
    }

    await client.query('delete from team_members where team_id = $1 and user_id = $2', [
      teamId,
      userId,
    ])
    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'team.member_remove',
        targetType: 'team',
        targetId: teamId,
        detail: { userId },
      },
      client,
    )
  })
}

export async function leaveTeam(userId: string, teamId: string): Promise<void> {
  return withUser(userId, async (client) => {
    // Lock the team row so two owners leaving at once cannot both succeed.
    await client.query('select id from teams where id = $1 for update', [teamId])

    const own = await client.query<{ role: TeamRole }>(
      'select role from team_members where team_id = $1 and user_id = $2',
      [teamId, userId],
    )
    const role = own.rows[0]?.role
    if (!role) throw fail('not_found', 'you are not in this team')

    if (role === 'owner') {
      const owners = await client.query<{ n: string }>(
        `select count(*)::text as n from team_members where team_id = $1 and role = 'owner'`,
        [teamId],
      )
      if (Number(owners.rows[0]?.n ?? '0') <= 1) {
        throw fail('invalid_params', 'a team needs an owner; hand the team over or delete it')
      }
    }

    await client.query('delete from team_members where team_id = $1 and user_id = $2', [
      teamId,
      userId,
    ])
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'team.member_leave',
        targetType: 'team',
        targetId: teamId,
      },
      client,
    )
  })
}

export async function renameTeam(
  actorId: string,
  teamId: string,
  name: string,
): Promise<{ name: string }> {
  return withUser(actorId, async (client) => {
    await requireTeamOwner(client, actorId, teamId)

    const trimmed = name.trim()
    if (!trimmed) throw fail('invalid_params', 'a team needs a name')
    if (trimmed.length > 80) throw fail('invalid_params', 'a team name is at most 80 characters')

    // The name only: the slug and the URL carry the team's identity.
    const updated = await client.query('update teams set name = $2 where id = $1', [teamId, trimmed])
  // The guard reads team_members; the update policy reads owner_user_id. Two owner
  // rows can disagree, and then nothing is written - say so instead of "renamed".
  if (updated.rowCount === 0) throw fail('forbidden', 'only a team owner can do that')
    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'team.rename',
        targetType: 'team',
        targetId: teamId,
        detail: { name: trimmed },
      },
      client,
    )
    return { name: trimmed }
  })
}

export async function deleteTeam(actorId: string, teamId: string): Promise<void> {
  return withUser(actorId, async (client) => {
    await requireTeamOwner(client, actorId, teamId)

    // project_grants.principal_id is polymorphic, so nothing cascades from here.
    const revoked = await client.query(
      `delete from project_grants where principal_type = 'team' and principal_id = $1`,
      [teamId],
    )
    await client.query('delete from teams where id = $1', [teamId])
    await audit(
      {
        actorType: 'user',
        actorId,
        action: 'team.delete',
        targetType: 'team',
        targetId: teamId,
        detail: { grantsRemoved: revoked.rowCount ?? 0 },
      },
      client,
    )
  })
}
