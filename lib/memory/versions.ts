import type { PoolClient } from 'pg'
import { withAdmin, withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { normalisePath } from './path'

export const VERSION_LIMIT = 20

export type MemoryVersion = {
  id: string
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  source: string
  updatedAt: Date
  createdAt: Date
}

export type VersionSummary = Omit<MemoryVersion, 'body' | 'summary'> & { bytes: number }

type SummaryRow = {
  id: string
  path: string
  title: string
  kind: string
  source: string
  updated_at: Date
  created_at: Date
  bytes: number
}

type VersionRow = SummaryRow & { summary: string | null; body: string }

/**
 * The row about to be overwritten, locked. The lock is the point: without it two
 * concurrent writers read the same old body, both archive it, and the body
 * written between them is never recorded.
 */
export async function archivePrevious(
  tx: PoolClient,
  input: { projectId: string; path: string; nextBody: string },
): Promise<string | null> {
  const { rows } = await tx.query<{
    id: string
    title: string
    summary: string | null
    body: string
    kind: string
    source: string
    updated_at: Date
    deleted_at: Date | null
  }>(
    `select id, title, summary, body, kind, source, updated_at, deleted_at
       from memories
      where project_id = $1 and lower(path) = lower($2)
        for update`,
    [input.projectId, input.path],
  )

  const previous = rows[0]
  // Reviving a deleted memory is not an overwrite: its body was discarded on
  // purpose, and keeping it would fill history with what someone deleted.
  if (!previous || previous.deleted_at !== null || previous.body === input.nextBody) return null

  await tx.query(
    `insert into memory_versions
       (memory_id, project_id, path, title, summary, body, kind, source, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      previous.id,
      input.projectId,
      input.path,
      previous.title,
      previous.summary,
      previous.body,
      previous.kind,
      previous.source,
      previous.updated_at,
    ],
  )

  return previous.id
}

export async function listVersions(
  userId: string,
  projectId: string,
  path: string,
  limit = VERSION_LIMIT,
): Promise<VersionSummary[]> {
  const normalised = normalisePath(path)
  await requireProjectRole(userId, projectId, 'read')
  const capped = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : VERSION_LIMIT, 1), 100)

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<SummaryRow>(
      `select id, path, title, kind, source, updated_at, created_at, length(body) as bytes
         from memory_versions
        where project_id = $1 and lower(path) = $2
        order by created_at desc, id desc
        limit $3`,
      [projectId, normalised, capped],
    )

    return rows.map((row) => ({
      id: String(row.id),
      path: row.path,
      title: row.title,
      kind: row.kind,
      source: row.source,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      bytes: Number(row.bytes),
    }))
  })
}

export async function getVersion(
  userId: string,
  projectId: string,
  versionId: string,
): Promise<MemoryVersion | null> {
  await requireProjectRole(userId, projectId, 'read')
  // Version ids are bigints; anything else cannot match a row.
  if (!/^\d+$/.test(versionId)) return null

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<VersionRow>(
      `select id, path, title, summary, body, kind, source, updated_at, created_at,
              length(body) as bytes
         from memory_versions
        where id = $1 and project_id = $2`,
      [versionId, projectId],
    )

    const row = rows[0]
    if (!row) return null
    return {
      id: String(row.id),
      path: row.path,
      title: row.title,
      summary: row.summary,
      body: row.body,
      kind: row.kind,
      source: row.source,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }
  })
}

/**
 * Restore is an ordinary write, so the content it replaces becomes history and
 * a mistaken restore can itself be undone.
 */
export async function restoreVersion(
  userId: string,
  projectId: string,
  versionId: string,
): Promise<{ restored: true; path: string } | { restored: false; reason: 'not_found' }> {
  const version = await getVersion(userId, projectId, versionId)
  if (!version) return { restored: false, reason: 'not_found' }

  // Lazy import: service.ts imports this module, so a static cycle would be
  // evaluated as undefined at module load.
  const { writeMemory } = await import('./service')
  await writeMemory({
    userId,
    projectId,
    path: version.path,
    body: version.body,
    title: version.title,
    kind: version.kind,
    source: 'restore',
  })

  return { restored: true, path: version.path }
}

/**
 * Install-wide, like the purge it rides with: keeps the newest VERSION_LIMIT per
 * memory and nothing else.
 */
export async function pruneVersions(keep = VERSION_LIMIT): Promise<number> {
  return withAdmin(async (tx) => {
    const { rowCount } = await tx.query(
      `delete from memory_versions v
         using (
           select id, row_number() over (partition by memory_id order by created_at desc, id desc) as rn
             from memory_versions
         ) ranked
        where v.id = ranked.id and ranked.rn > $1`,
      [keep],
    )
    return rowCount ?? 0
  })
}
