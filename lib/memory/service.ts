import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { BodyTooLarge, InvalidInput, MAX_BODY_BYTES, normalisePath, titleFromBody } from './path'
import { MEMORY_KINDS } from './types'
import type { MemoryRow, TreeEntry, WriteInput, WriteResult } from './types'

export type { MemoryRow, TreeEntry, WriteInput, WriteResult } from './types'

type Row = {
  id: string
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  updated_at: Date
}

/**
 * One statement, so two agents writing the same path concurrently settle on one
 * row instead of racing between a SELECT and an INSERT.
 */
export async function writeMemory(input: WriteInput): Promise<WriteResult> {
  const path = normalisePath(input.path)
  const size = Buffer.byteLength(input.body, 'utf8')
  if (size > MAX_BODY_BYTES) throw new BodyTooLarge(size)
  if (input.body.trim() === '') throw new InvalidInput('body must not be empty')
  if (input.kind && !(MEMORY_KINDS as readonly string[]).includes(input.kind)) {
    throw new InvalidInput(`kind must be one of ${MEMORY_KINDS.join(', ')}`)
  }
  // Postgres rejects a NUL byte with 22021, which would reach the caller as a
  // raw driver error. Refuse it here so agents get the documented code.
  if (input.body.includes('\u0000') || (input.title ?? '').includes('\u0000')) {
    throw new InvalidInput('text must not contain NUL bytes')
  }

  await requireProjectRole(input.userId, input.projectId, 'write')

  const title = (input.title?.trim() || titleFromBody(input.body)).slice(0, 120)
  const kind = input.kind ?? 'note'
  const source = input.source ?? 'agent'

  return withUser(input.userId, async (tx) => {
    const { rows } = await tx.query<{ created: boolean }>(
      `insert into memories (project_id, path, title, summary, body, tsv, kind, source, author_user_id)
       select $1, $2, $3, null, $4,
              to_tsvector(coalesce(p.fts_language, 'english')::regconfig, $2 || ' ' || $3 || ' ' || $4),
              $5, $6, $7
         from projects p where p.id = $1
       on conflict (project_id, lower(path)) do update
          set title = excluded.title,
              summary = null,
              body = excluded.body,
              tsv = excluded.tsv,
              kind = excluded.kind,
              source = excluded.source,
              author_user_id = excluded.author_user_id,
              updated_at = now(),
              deleted_at = null
       returning (xmax = 0) as created`,
      [input.projectId, path, title, input.body, kind, source, input.userId],
    )

    return { path, created: rows[0]?.created ?? false }
  })
}

export async function readMemory(
  userId: string,
  projectId: string,
  path: string,
): Promise<MemoryRow | null> {
  const normalised = normalisePath(path)
  await requireProjectRole(userId, projectId, 'read')

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<Row>(
      `select id, path, title, summary, body, kind, updated_at
         from memories
        where project_id = $1 and lower(path) = $2 and deleted_at is null`,
      [projectId, normalised],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      path: row.path,
      title: row.title,
      summary: row.summary,
      body: row.body,
      kind: row.kind,
      updatedAt: row.updated_at,
    }
  })
}

/**
 * Directories are virtual: depth is counted from the path itself, so there is no
 * folder table and no empty directory to keep in sync.
 */
export async function treeMemory(
  userId: string,
  projectId: string,
  pathPrefix: string,
  depth: number,
): Promise<TreeEntry[]> {
  const prefix = pathPrefix.trim() === '' ? '' : normalisePath(pathPrefix)
  const levels = Number.isFinite(depth) ? Math.max(1, Math.trunc(depth)) : 1
  await requireProjectRole(userId, projectId, 'read')

  const prefixDepth = prefix === '' ? 0 : prefix.split('/').length

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{
      path: string
      title: string
      has_summary: boolean
      updated_at: Date
    }>(
      `select path, title, (summary is not null) as has_summary, updated_at
         from memories
        where project_id = $1
          and deleted_at is null
          and ($2 = '' or path = $2 or starts_with(path, $2 || '/'))
          and array_length(string_to_array(path, '/'), 1) <= $3
        order by path`,
      [projectId, prefix, prefixDepth + levels],
    )
    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      hasSummary: row.has_summary,
      updatedAt: row.updated_at,
    }))
  })
}

export async function deleteMemory(
  userId: string,
  projectId: string,
  path: string,
): Promise<boolean> {
  const normalised = normalisePath(path)
  await requireProjectRole(userId, projectId, 'write')

  return withUser(userId, async (tx) => {
    const { rowCount } = await tx.query(
      `update memories set deleted_at = now()
        where project_id = $1 and lower(path) = $2 and deleted_at is null`,
      [projectId, normalised],
    )
    return (rowCount ?? 0) > 0
  })
}
