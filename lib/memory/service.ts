import { withAdmin, withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { EXTRACT_DEBOUNCE_SECONDS } from '@/lib/jobs/constants'
import { embedText } from './embeddings'
import { archiveVersion } from './versions'
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

  // Before the transaction: a provider round trip inside it would hold a
  // pooled connection for the duration of someone else's network call.
  const embedded = await embedText([path, title, input.body].join('\n'), {
    inputType: 'document',
    purpose: 'embed.ingest',
  })
  const embedding = embedded?.literal ?? null

  const result = await withUser(input.userId, async (tx) => {
    const { rows } = await tx.query<{
      created: boolean
      id: string
      old_title: string | null
      old_summary: string | null
      old_body: string | null
      old_kind: string | null
      old_source: string | null
      old_updated_at: Date | null
      old_deleted_at: Date | null
    }>(
      `insert into memories (project_id, path, title, summary, body, tsv, kind, source, author_user_id, embedding, embedded_at, embedding_model)
       select $1, $2, $3, null, $4,
              to_tsvector(coalesce(p.fts_language, 'english')::regconfig, $2 || ' ' || $3 || ' ' || $4),
              $5, $6, $7, $8::vector,
              case when $8::text is null then null else now() end, $9
         from projects p where p.id = $1
       on conflict (project_id, lower(path)) do update
          set title = excluded.title,
              summary = null,
              body = excluded.body,
              tsv = excluded.tsv,
              kind = excluded.kind,
              source = excluded.source,
              author_user_id = excluded.author_user_id,
              embedding = excluded.embedding,
              embedded_at = excluded.embedded_at,
              embedding_model = excluded.embedding_model,
              updated_at = now(),
              deleted_at = null
       returning (xmax = 0) as created,
                 id,
                 old.title as old_title,
                 old.summary as old_summary,
                 old.body as old_body,
                 old.kind as old_kind,
                 old.source as old_source,
                 old.updated_at as old_updated_at,
                 old.deleted_at as old_deleted_at`,
      [
        input.projectId,
        path,
        title,
        input.body,
        kind,
        source,
        input.userId,
        embedding,
        embedded?.model ?? null,
      ],
    )

    const written = rows[0]
    // Postgres 18 returns the pre-image of the updated row, so the archive costs
    // no extra query and sees the row the winner of a create race committed.
    if (
      written &&
      !written.created &&
      written.old_body !== null &&
      written.old_deleted_at === null &&
      written.old_body !== input.body
    ) {
      await archiveVersion(tx, {
        memoryId: written.id,
        projectId: input.projectId,
        path,
        title: written.old_title ?? title,
        summary: written.old_summary,
        body: written.old_body,
        kind: written.old_kind ?? kind,
        source: written.old_source ?? source,
        updatedAt: written.old_updated_at ?? new Date(),
      })
    }

    return { path, created: written?.created ?? false }
  })

  await enqueueExtraction(input.projectId)
  return result
}

/**
 * Every write queues an extraction; the queue's `short` policy collapses them
 * per project, and the handler checks `learning_enabled` at run time because
 * the flag can change between the write and the job.
 */
async function enqueueExtraction(projectId: string): Promise<void> {
  try {
    const { sendJob } = await import('@/lib/jobs/boss')
    await sendJob(
      'extract',
      { projectId },
      { singletonKey: projectId, startAfter: EXTRACT_DEBOUNCE_SECONDS },
    )
  } catch (error) {
    console.error(`could not queue extraction (${(error as Error).message})`)
  }
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

/** How long a deleted memory stays recoverable before the purge job removes it. */
export const PURGE_AFTER_DAYS = 30

export type DeletedMemory = { path: string; title: string; deletedAt: Date }

export async function listDeletedMemories(
  userId: string,
  projectId: string,
  limit = 100,
): Promise<DeletedMemory[]> {
  await requireProjectRole(userId, projectId, 'read')
  const take = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500)

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ path: string; title: string; deleted_at: Date }>(
      `select path, title, deleted_at
         from memories
        where project_id = $1 and deleted_at is not null
        order by deleted_at desc
        limit $2`,
      [projectId, take],
    )
    return rows.map((row) => ({ path: row.path, title: row.title, deletedAt: row.deleted_at }))
  })
}

/**
 * Undoes a soft delete. A live row at the same path wins: restoring over it
 * would silently destroy someone's work, so the caller is told to rename first.
 */
export async function restoreMemory(
  userId: string,
  projectId: string,
  path: string,
): Promise<{ restored: true } | { restored: false; reason: 'not_found' | 'conflict' }> {
  const normalised = normalisePath(path)
  await requireProjectRole(userId, projectId, 'write')

  return withUser(userId, async (tx) => {
    const { rowCount } = await tx.query(
      `update memories set deleted_at = null
        where project_id = $1 and lower(path) = $2 and deleted_at is not null`,
      [projectId, normalised],
    )
    if ((rowCount ?? 0) > 0) return { restored: true as const }

    const { rows } = await tx.query<{ deleted_at: Date | null }>(
      `select deleted_at from memories
        where project_id = $1 and lower(path) = $2
        order by deleted_at nulls first
        limit 1`,
      [projectId, normalised],
    )
    if (rows[0]?.deleted_at === null) return { restored: false as const, reason: 'conflict' as const }
    return { restored: false as const, reason: 'not_found' as const }
  })
}

/**
 * Install-wide, so it runs as the owner: a sessionless job has no
 * mimir.user_id and the memories policy would hide every row from it.
 */
export async function purgeDeletedMemories(now: Date = new Date()): Promise<{ removed: number }> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000)

  return withAdmin(async (tx) => {
    const { rowCount } = await tx.query(
      `delete from memories where deleted_at is not null and deleted_at < $1`,
      [cutoff],
    )
    return { removed: rowCount ?? 0 }
  })
}
