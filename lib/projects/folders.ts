import type { PoolClient } from 'pg'

import { audit } from '@/lib/audit'
import { withUser } from '@/lib/db/tx'
import { InvalidInput } from '@/lib/memory/path'

import { forbidden } from './access'
import { localPath } from './repo'

/**
 * A folder a session can start in and still reach the right project. Claims are
 * private to the account that made them, so two people may claim one path and
 * never see each other's project.
 */

export type FolderMatch = { projectId: string; slug: string }

export async function folderForPath(
  client: PoolClient,
  userId: string,
  absolute: string,
): Promise<FolderMatch | null> {
  const { rows } = await client.query<{ project_id: string; slug: string }>(
    // The trailing slash is what stops `/Users/me/AI` matching `/Users/me/AI2`.
    // Longest claim wins, so a claim inside a claimed folder takes over.
    `select f.project_id, p.slug
       from project_folders f
       join projects p on p.id = f.project_id
      where f.created_by = $1
        and p.archived_at is null
        and (lower($2) = lower(f.path) or lower($2) like lower(f.path) || '/%')
      order by length(f.path) desc
      limit 1`,
    [userId, absolute],
  )
  const row = rows[0]
  return row ? { projectId: row.project_id, slug: row.slug } : null
}

export async function claimFolder(
  userId: string,
  projectId: string,
  raw: string,
): Promise<{ path: string }> {
  const path = localPath(raw)
  if (!path) throw new InvalidInput('a folder must be an absolute path, for example /Users/you/AI')

  return withUser(userId, async (client) => {
    const owned = await client.query('select 1 from projects where id = $1 and owner_user_id = $2', [
      projectId,
      userId,
    ])
    if (owned.rowCount === 0) throw forbidden('Only the project owner can change that.')

    const taken = await client.query<{ project_id: string; path: string }>(
      `select project_id, path from project_folders where created_by = $1 and lower(path) = lower($2)`,
      [userId, path],
    )
    const existing = taken.rows[0]
    if (existing) {
      if (existing.project_id === projectId) return { path: existing.path }
      throw new InvalidInput('that folder is already claimed by another project')
    }

    const { rows } = await client.query<{ path: string }>(
      `insert into project_folders (project_id, path, created_by) values ($1, $2, $3) returning path`,
      [projectId, path, userId],
    )
    const claimed = rows[0]!.path
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'project.folders',
        targetType: 'project',
        targetId: projectId,
        detail: { path: claimed, action: 'claim' },
      },
      client,
    )
    return { path: claimed }
  })
}

export async function releaseFolder(userId: string, folderId: string): Promise<{ path: string }> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ path: string; project_id: string }>(
      `delete from project_folders where id = $1 and created_by = $2 returning path, project_id`,
      [folderId, userId],
    )
    const row = rows[0]
    if (!row) throw new InvalidInput('that folder is not yours')

    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'project.folders',
        targetType: 'project',
        targetId: row.project_id,
        detail: { path: row.path, action: 'release' },
      },
      client,
    )
    return { path: row.path }
  })
}

export async function listFolders(userId: string, projectId: string): Promise<string[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ path: string }>(
      `select path from project_folders where project_id = $1 order by path`,
      [projectId],
    )
    return rows.map((row) => row.path)
  })
}
