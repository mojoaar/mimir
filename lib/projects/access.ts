import { withUser } from '@/lib/db/tx'

export type ProjectRole = 'owner' | 'write' | 'read' | null

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
 * RLS already hides projects the user has no business seeing, so a null here
 * means either "no access" or "no such project" — deliberately the same
 * answer, so a caller cannot probe for someone else's slugs.
 */
export async function projectRole(
  userId: string,
  projectId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectRole> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ owner_user_id: string; role: 'read' | 'write' | null }>(
      // An archived project is out of reach for every verb, so a memory write by
      // id is refused the same way a read is. Only archive/restore pass
      // includeArchived, so they can still find the row they are changing.
      `select p.owner_user_id, g.role
         from projects p
         left join project_grants g
           on g.project_id = p.id and g.principal_type = 'user' and g.principal_id = $2
        where p.id = $1 and ($3::boolean or p.archived_at is null)`,
      [projectId, userId, opts.includeArchived ?? false],
    )
    const row = rows[0]
    if (!row) return null
    if (row.owner_user_id === userId) return 'owner'
    return row.role
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

/** Only the owner may share a project; holding write does not imply that right. */
export async function grantProject(
  actorUserId: string,
  projectId: string,
  principalId: string,
  role: 'read' | 'write',
): Promise<void> {
  await requireProjectRole(actorUserId, projectId, 'owner')
  await withUser(actorUserId, async (tx) => {
    await tx.query(
      `insert into project_grants (project_id, principal_type, principal_id, role, created_by)
       values ($1, 'user', $2, $3, $4)
       on conflict (project_id, principal_type, principal_id)
       do update set role = excluded.role`,
      [projectId, principalId, role, actorUserId],
    )
  })
}

export async function revokeGrant(
  actorUserId: string,
  projectId: string,
  principalId: string,
): Promise<void> {
  await requireProjectRole(actorUserId, projectId, 'owner')
  await withUser(actorUserId, async (tx) => {
    await tx.query(
      `delete from project_grants
        where project_id = $1 and principal_type = 'user' and principal_id = $2`,
      [projectId, principalId],
    )
  })
}

export async function listGrants(
  actorUserId: string,
  projectId: string,
): Promise<{ userId: string; email: string; role: 'read' | 'write' }[]> {
  await requireProjectRole(actorUserId, projectId, 'write')
  return withUser(actorUserId, async (tx) => {
    const { rows } = await tx.query<{ user_id: string; email: string; role: 'read' | 'write' }>(
      `select g.principal_id as user_id, u.email, g.role
         from project_grants g
         join users u on u.id = g.principal_id
        where g.project_id = $1 and g.principal_type = 'user'
        order by u.email`,
      [projectId],
    )
    return rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role }))
  })
}
