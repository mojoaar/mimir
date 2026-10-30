import { requireProjectRole } from '@/lib/projects/access'
import { withUser } from '@/lib/db/tx'

import { normalisePath } from './path'
import type { TreeEntry, TreeOrder } from './types'
import type { MemoryRow } from './types'
import type { MemoryVersion, VersionSummary } from './versions'
import { VERSION_LIMIT } from './versions'
import type { DeletedMemory } from './service'

export type ProjectViewInput = {
  userId: string
  projectId: string
  path?: string
  sort: TreeOrder
  depth: number
  versionId?: string
}

export type ProjectView = {
  memory: MemoryRow | null
  entries: TreeEntry[]
  deleted: DeletedMemory[]
  versions: VersionSummary[]
  version: MemoryVersion | null
}

const TREE_ORDER: Record<TreeOrder, string> = {
  path: 'path',
  added: 'created_at desc, path',
  updated: 'updated_at desc, path',
}

type MemoryRowShape = {
  id: string
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  client: string | null
  session: string | null
  updated_at: Date
}

type TreeRowShape = {
  path: string
  title: string
  has_summary: boolean
  created_at: Date
  updated_at: Date
}

type VersionRowShape = {
  id: string | number
  path: string
  title: string
  summary: string | null
  body?: string
  kind: string
  source: string
  client: string | null
  session: string | null
  updated_at: Date
  created_at: Date
  bytes: number
}

/**
 * One project page, one authorization check and one transaction.
 *
 * The page used to call readMemory, treeMemory, listDeletedMemories,
 * listVersions and getVersion, and each of them re-checked the role and opened
 * its own transaction: a dozen pool checkouts for one screen. The SQL below
 * mirrors those helpers verbatim, so an edit to one belongs in both.
 *
 * Search is deliberately not here: it may spend seconds on an embedding
 * provider, and holding this transaction across that wait would cost a
 * connection for every slow search.
 */
export async function readProjectView(input: ProjectViewInput): Promise<ProjectView> {
  const { userId, projectId } = input
  await requireProjectRole(userId, projectId, 'read')

  const path = input.path ? normalisePath(input.path) : null
  const prefix = ''
  const levels = Number.isFinite(input.depth) ? Math.max(1, Math.trunc(input.depth)) : 1
  const versionId = input.versionId && /^\d+$/.test(input.versionId) ? input.versionId : null

  return withUser(userId, async (tx) => {
    const memory = path
      ? await tx
          .query<MemoryRowShape>(
            `select id, path, title, summary, body, kind, client, session, updated_at
               from memories
              where project_id = $1 and lower(path) = $2 and deleted_at is null`,
            [projectId, path],
          )
          .then(({ rows }) => rows[0] ?? null)
      : null

    const entries = await tx
      .query<TreeRowShape>(
        `select path, title, (summary is not null) as has_summary, created_at, updated_at
           from memories
          where project_id = $1
            and deleted_at is null
            and ($2 = '' or path = $2 or starts_with(path, $2 || '/'))
            and array_length(string_to_array(path, '/'), 1) <= $3
          order by ${TREE_ORDER[input.sort]}`,
        [projectId, prefix, levels],
      )
      .then(({ rows }) =>
        rows.map((row) => ({
          path: row.path,
          title: row.title,
          hasSummary: row.has_summary,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      )

    const deleted = await tx
      .query<{ path: string; title: string; deleted_at: Date }>(
        `select path, title, deleted_at
           from memories
          where project_id = $1 and deleted_at is not null
          order by deleted_at desc
          limit 100`,
        [projectId],
      )
      .then(({ rows }) =>
        rows.map((row) => ({ path: row.path, title: row.title, deletedAt: row.deleted_at })),
      )

    const versions = memory
      ? await tx
          .query<VersionRowShape>(
            `select id, path, title, kind, source, client, session, updated_at, created_at,
                    octet_length(body) as bytes
               from memory_versions
              where project_id = $1 and lower(path) = $2
              order by created_at desc, id desc
              limit $3`,
            [projectId, path, VERSION_LIMIT],
          )
          .then(({ rows }) => rows.map(toSummary))
      : []

    const version =
      versionId && memory
        ? await tx
            .query<VersionRowShape>(
              `select id, path, title, summary, body, kind, source, client, session,
                      updated_at, created_at, octet_length(body) as bytes
                 from memory_versions
                where id = $1 and project_id = $2`,
              [versionId, projectId],
            )
            .then(({ rows }) => {
              const row = rows[0]
              if (!row) return null
              return {
                ...toSummary(row),
                summary: row.summary,
                body: row.body ?? '',
              }
            })
        : null

    return {
      memory: memory
        ? {
            id: memory.id,
            path: memory.path,
            title: memory.title,
            summary: memory.summary,
            body: memory.body,
            kind: memory.kind,
            client: memory.client,
            session: memory.session,
            updatedAt: memory.updated_at,
          }
        : null,
      entries,
      deleted,
      versions,
      version,
    }
  })
}

function toSummary(row: VersionRowShape): VersionSummary {
  return {
    id: String(row.id),
    path: row.path,
    title: row.title,
    kind: row.kind,
    source: row.source,
    client: row.client,
    session: row.session,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    bytes: Number(row.bytes),
  }
}
