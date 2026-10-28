import { withUser } from '@/lib/db/tx'
import { withAdmin } from '@/lib/db/tx'

export type ProjectRole = 'owner' | 'write' | 'read' | null

export type PrincipalType = 'user' | 'team'

export type GrantRow = {
  principalType: PrincipalType
  principalId: string
  label: string
  role: 'read' | 'write'
}

export type Forbidden = Error & { code: 'forbidden' }

export function forbidden(message = 'forbidden'): Forbidden {
  const err = new Error(message) as Forbidden
  err.code = 'forbidden'
  return err
}

const RANK: Record<Exclude<ProjectRole, null>, number> = { read: 1, write: 2, owner: 3 }

/**
 * The role a user holds on a project, or null when they cannot see it.
 *
 * A grant can name the user or a team they belong to; the best of those decides,
 * and a team never makes anyone the owner. RLS already hides projects the user
 * has no business seeing, so a null here means either "no access" or "no such
 * project" - deliberately the same answer, so a caller cannot probe for
 * someone else's slugs.
 */
/**
 * The one definition of "how much does this user get from the grants on this
 * project": 2 for a write grant, 1 for read, null for none. Owners are handled
 * by the caller, because a grant never makes anyone an owner.
 *
 * `userParam` is `$1` by default; `projectRole` binds the project first, so it
 * passes `$2`. Everything else (resolveProject, getProject, listProjects) uses
 * the default, which keeps one rule from drifting into three.
 */
export function grantRankSql(userParam = '$1'): string {
  return `(select max(case g.role when 'write' then 2 else 1 end)
             from project_grants g
             left join team_members tm
               on g.principal_type = 'team'
              and tm.team_id = g.principal_id
              and tm.user_id = ${userParam}
            where g.project_id = p.id
              and ((g.principal_type = 'user' and g.principal_id = ${userParam})
                   or tm.user_id is not null))`
}

export async function projectRole(
  userId: string,
  projectId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectRole> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ owner_user_id: string; rank: number | null }>(
      // An archived project is out of reach for every verb, so a memory write by
      // id is refused the same way a read is. Only archive/restore pass
      // includeArchived, so they can still find the row they are changing.
      `select p.owner_user_id,
              ${grantRankSql('$2')} as rank
         from projects p
        where p.id = $1 and ($3::boolean or p.archived_at is null)`,
      [projectId, userId, opts.includeArchived ?? false],
    )
    const row = rows[0]
    if (!row) return null
    if (row.owner_user_id === userId) return 'owner'
    if (row.rank === 2) return 'write'
    if (row.rank === 1) return 'read'
    return null
  })
}

export async function requireProjectRole(
  userId: string,
  projectId: string,
  needed: 'read' | 'write' | 'owner',
): Promise<ProjectRole> {
  const role = await projectRole(userId, projectId)
  if (role === null || RANK[role] < RANK[needed]) throw forbidden()
  return role
}

/**
 * Only the owner may share a project; holding write does not imply that right.
 * A team may only be shared with by someone who belongs to it, so nobody can
 * bolt a stranger's team onto their own project.
 */
export async function grantProject(
  actorUserId: string,
  projectId: string,
  principalType: PrincipalType,
  principalId: string,
  role: 'read' | 'write',
): Promise<void> {
  await requireProjectRole(actorUserId, projectId, 'owner')
  if (principalType === 'team') await requireTeamMembership(actorUserId, principalId)
  await withUser(actorUserId, async (tx) => {
    await tx.query(
      `insert into project_grants (project_id, principal_type, principal_id, role, created_by)
       values ($1, $2, $3, $4, $5)
       on conflict (project_id, principal_type, principal_id)
       do update set role = excluded.role`,
      [projectId, principalType, principalId, role, actorUserId],
    )
  })
}

/**
 * Removing access needs no membership check: taking access away is never an
 * escalation, and an owner who has left a team must still be able to revoke it.
 */
export async function revokeGrant(
  actorUserId: string,
  projectId: string,
  principalType: PrincipalType,
  principalId: string,
): Promise<void> {
  await requireProjectRole(actorUserId, projectId, 'owner')
  await withUser(actorUserId, async (tx) => {
    await tx.query(
      `delete from project_grants
        where project_id = $1 and principal_type = $2 and principal_id = $3`,
      [projectId, principalType, principalId],
    )
  })
}

export async function listGrants(
  actorUserId: string,
  projectId: string,
): Promise<GrantRow[]> {
  await requireProjectRole(actorUserId, projectId, 'owner')
  return withUser(actorUserId, async (tx) => {
    const { rows } = await tx.query<{
      principal_type: PrincipalType
      principal_id: string
      label: string | null
      role: 'read' | 'write'
    }>(
      // A team the caller is not in is hidden by RLS, so its name can be
      // missing; the id still lets the owner revoke it.
      `select g.principal_type, g.principal_id,
              coalesce(u.email, t.name, 'a team') as label,
              g.role
         from project_grants g
         left join users u on g.principal_type = 'user' and u.id = g.principal_id
         left join teams t on g.principal_type = 'team' and t.id = g.principal_id
        where g.project_id = $1
        order by label`,
      [projectId],
    )
    return rows.map((r) => ({
      principalType: r.principal_type,
      principalId: r.principal_id,
      label: r.label ?? '',
      role: r.role,
    }))
  })
}

async function requireTeamMembership(actorUserId: string, teamId: string): Promise<void> {
  const member = await withUser(actorUserId, async (tx) => {
    const { rows } = await tx.query(
      'select 1 from team_members where team_id = $1 and user_id = $2',
      [teamId, actorUserId],
    )
    return rows.length > 0
  })
  if (member) return

  // RLS hides a team the actor cannot see, so existence needs the owner
  // connection to tell "no such team" from "not yours".
  const exists = await withAdmin(async (tx) => {
    const { rows } = await tx.query('select 1 from teams where id = $1', [teamId])
    return rows.length > 0
  })
  if (!exists) {
    const err = new Error('no such team') as Error & { code: 'not_found' }
    err.code = 'not_found'
    throw err
  }
  throw forbidden('you can only share with a team you belong to')
}
