import { audit } from '@/lib/audit'
import { withUser } from '@/lib/db/tx'
import { InvalidInput } from '@/lib/memory/path'
import { normaliseRepoKey } from './repo'

import { forbidden, grantProject, projectRole } from './access'

export type AccessRequest = {
  id: string
  userId: string
  email: string
  note: string | null
  createdAt: Date
}

export type AccessDecision = 'grant' | 'decline'

export type MyAccessRequest = {
  id: string
  repoKey: string
  note: string | null
  createdAt: Date
  decision: 'granted' | 'declined' | null
  resolvedAt: Date | null
}

/**
 * Asks the owner of the project that answers for a repository. The lookup and
 * the insert happen inside one SECURITY DEFINER function, so the requester
 * never holds a project id they were not given.
 */
export async function requestAccess(
  userId: string,
  repo: string,
  note?: string,
): Promise<'requested' | 'already'> {
  const key = normaliseRepoKey(repo)
  if (!key || key.startsWith('local:')) {
    throw new InvalidInput('access is asked for with a repository, not a folder')
  }

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ answer: string }>(
      'select request_project_access($1, $2) as answer',
      [key, note ?? null],
    )
    const answer = rows[0]?.answer

    if (answer === 'no-project') {
      throw new InvalidInput('no project answers for that repository')
    }

    if (answer === 'requested') {
      await audit(
        {
          actorType: 'user',
          actorId: userId,
          action: 'project.access_request',
          targetType: 'project',
          detail: { repo: key },
        },
        tx,
      )
    }

    return answer === 'requested' ? 'requested' : 'already'
  })
}

/** The open questions on a project, for its owner. */
export async function listAccessRequests(userId: string, projectId: string): Promise<AccessRequest[]> {
  if ((await projectRole(userId, projectId)) !== 'owner') {
    throw forbidden('Only the project owner can change that.')
  }

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{
      id: string
      user_id: string
      email: string
      note: string | null
      created_at: Date
    }>(
      `select r.id, r.user_id, u.email, r.note, r.created_at
         from project_access_requests r
         join users u on u.id = r.user_id
        where r.project_id = $1 and r.resolved_at is null
        order by r.created_at`,
      [projectId],
    )
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      note: row.note,
      createdAt: row.created_at,
    }))
  })
}

/**
 * Answers one request. A grant is the same write grant the Sharing form makes,
 * so the requester lands in the project the owner already had.
 */
export async function resolveAccessRequest(
  userId: string,
  requestId: string,
  decision: AccessDecision,
): Promise<void> {
  const row = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ project_id: string; user_id: string }>(
      'select project_id, user_id from project_access_requests where id = $1 and resolved_at is null',
      [requestId],
    )
    return rows[0] ?? null
  })
  if (!row) throw new InvalidInput('that request is no longer open')

  if ((await projectRole(userId, row.project_id)) !== 'owner') {
    throw forbidden('Only the project owner can change that.')
  }

  if (decision === 'grant') {
    await grantProject(userId, row.project_id, 'user', row.user_id, 'write')
  }

  await withUser(userId, async (tx) => {
    await tx.query(
      `update project_access_requests
          set resolved_at = now(), resolved_by = $2, decision = $3
        where id = $1 and resolved_at is null`,
      [requestId, userId, decision === 'grant' ? 'granted' : 'declined'],
    )
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: decision === 'grant' ? 'project.access_granted' : 'project.access_declined',
        targetType: 'project',
        targetId: row.project_id,
        detail: { userId: row.user_id },
      },
      tx,
    )
  })
}

/**
 * The caller's own requests. The project row is invisible to them, so the
 * definer function reads the repository name without exposing the project.
 */
export async function myAccessRequests(userId: string): Promise<MyAccessRequest[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<MyAccessRequest>(
      `select id, repo_key as "repoKey", note, created_at as "createdAt",
              decision, resolved_at as "resolvedAt"
         from my_access_requests()`,
    )
    return rows
  })
}
