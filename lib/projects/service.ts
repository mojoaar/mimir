import type { PoolClient } from 'pg'

import { withUser } from '@/lib/db/tx'
import { enqueueExtraction } from '@/lib/jobs/enqueue'
import { getLearningDefault } from '@/lib/settings/learning'
import { audit } from '@/lib/audit'
import { slugify } from '@/lib/slug'

import { forbidden, grantRankSql, projectRole, requireProjectRole } from './access'
import { normaliseRepoKey, repoSlug } from './repo'

export type ProjectRole = 'owner' | 'write' | 'read'

export type ResolvedProject = {
  id: string
  slug: string
  role: ProjectRole | null
}

type AccessRow = {
  id: string
  slug: string
  is_owner: boolean
  grant_rank: number | null
}

const GRANT_RANK = grantRankSql('$1')

const ACCESSIBLE = `
  p.archived_at IS NULL
  AND (p.owner_user_id = $1 OR ${GRANT_RANK} IS NOT NULL)
`

function toRole(row: AccessRow): ProjectRole {
  if (row.is_owner) return 'owner'
  return row.grant_rank === 2 ? 'write' : 'read'
}

/**
 * Resolution order from the spec: explicit slug, then a repo key the caller can
 * already reach, then a new project owned by the caller. Finding a shared
 * project before creating one is what keeps two agents on one repo together.
 */
export async function resolveProject(
  userId: string,
  opts: { project?: string; repo?: string; create?: boolean } = {},
): Promise<ResolvedProject> {
  const repoKey = opts.repo ? normaliseRepoKey(opts.repo) : null

  return withUser(userId, async (client) => {
    if (opts.project) {
      const found = await client.query<AccessRow>(
        `SELECT p.id, p.slug, (p.owner_user_id = $1) AS is_owner,
                ${GRANT_RANK} AS grant_rank
           FROM projects p
          WHERE ${ACCESSIBLE} AND p.slug = $2
          LIMIT 1`,
        [userId, slugify(opts.project)],
      )
      const row = found.rows[0]
      if (!row) {
        // A named project is how a folder that is not a repository gets one:
        // there is no repo key to derive it from, and the caller already chose
        // the name. A lookup-only caller still gets the not-found error.
        if (opts.create !== true) throw new ProjectNotFoundError(opts.project)
        return createProject(userId, repoKey, client, opts.project)
      }
      return { id: row.id, slug: row.slug, role: toRole(row) }
    }

    if (repoKey) {
      const found = await client.query<AccessRow>(
        `SELECT p.id, p.slug, (p.owner_user_id = $1) AS is_owner,
                ${GRANT_RANK} AS grant_rank
           FROM projects p
          WHERE ${ACCESSIBLE} AND p.repo_key = $2
          ORDER BY (p.owner_user_id = $1) DESC, p.updated_at DESC
          LIMIT 1`,
        [userId, repoKey],
      )
      const row = found.rows[0]
      if (row) return { id: row.id, slug: row.slug, role: toRole(row) }
    }

    // Only a caller that says `create: true` may create: a typo'd slug on a
    // read must be a 404, not a new empty project.
    if (opts.create !== true) throw new ProjectNotFoundError(opts.project ?? opts.repo ?? 'project')

    return createProject(userId, repoKey, client)
  })
}

export class ProjectNotFoundError extends Error {
  readonly code = 'project_not_found'

  constructor(which: string) {
    super(`no accessible project for ${which}`)
    this.name = 'ProjectNotFoundError'
  }
}

async function createProject(
  userId: string,
  repoKey: string | null,
  client: PoolClient,
  requestedName?: string,
): Promise<ResolvedProject> {
  const base = requestedName
    ? slugify(requestedName)
    : repoKey
      ? repoSlug(repoKey)
      : 'project'
  const name =
    requestedName ??
    (repoKey && !repoKey.startsWith('local:') ? repoKey : base)

  // Read before the insert: creation happens rarely, and the default is copied
  // into the row so later changes to it never touch a project that exists.
  const learningEnabled = await getLearningDefault()

  for (let attempt = 1; attempt <= 5; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    // The repo_key unique index can fire on an archived project, and a failed
    // statement aborts the whole transaction: the savepoint is what lets the
    // recovery SELECT run at all.
    await client.query('SAVEPOINT create_project')
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO projects (owner_user_id, name, slug, repo_key, learning_enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (owner_user_id, slug) DO NOTHING
         RETURNING id`,
        [userId, name, slug, repoKey, learningEnabled],
      )
      const row = inserted.rows[0]
      if (row) {
        await client.query('RELEASE SAVEPOINT create_project')
        return { id: row.id, slug, role: 'owner' }
      }
      await client.query('RELEASE SAVEPOINT create_project')
    } catch (error) {
      // Two clients created the same repo at once: adopt the winner.
      if ((error as { code?: string }).code !== '23505') throw error
      await client.query('ROLLBACK TO SAVEPOINT create_project')
      // A named project has no repo key, so match it by the slug that collided;
      // otherwise an archived project would silently fork into `name-2`.
      const existing = await client.query<{ id: string; slug: string }>(
        'SELECT id, slug FROM projects WHERE owner_user_id = $1 AND (repo_key = $2 OR slug = $3)',
        [userId, repoKey, slug],
      )
      const row = existing.rows[0]
      if (row) return { id: row.id, slug: row.slug, role: 'owner' }
    }
  }

  throw new Error(`could not allocate a project slug for ${repoKey ?? 'project'}`)
}

export type ProjectSummary = {
  id: string
  slug: string
  name: string
  role: ProjectRole | null
  memoryCount: number
  archived: boolean
}/** Projects the caller owns or holds a grant on - RLS already hides the rest. */
export async function listProjects(
  userId: string,
  includeArchived = false,
): Promise<ProjectSummary[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      id: string
      slug: string
      name: string
      owner_user_id: string
      rank: number | null
      memory_count: number
      archived: boolean
    }>(
      `SELECT p.id,
              p.slug,
              p.name,
              p.owner_user_id,
              ${GRANT_RANK} AS rank,
              (p.archived_at IS NOT NULL) AS archived,
              count(m.id)::int AS memory_count
         FROM projects p
         LEFT JOIN memories m ON m.project_id = p.id AND m.deleted_at IS NULL
        WHERE ($2::boolean OR p.archived_at IS NULL)
        GROUP BY p.id, p.owner_user_id, p.slug, p.name, p.archived_at, p.updated_at
        ORDER BY p.updated_at DESC`,
      [userId, includeArchived],
    )
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.owner_user_id === userId ? 'owner' : rankRole(row.rank),
      memoryCount: row.memory_count,
      archived: row.archived,
    }))
  })
}

function rankRole(rank: number | null): 'write' | 'read' | null {
  if (rank === 2) return 'write'
  if (rank === 1) return 'read'
  return null
}

export type ProjectSettings = {
  id: string
  slug: string
  name: string
  learningEnabled: boolean
  llmProviderId: string | null
  // null means RLS let the row through but no grant backs it: fail closed, never "read".
  role: ProjectRole | null
}

/** One project by slug, with the caller's role. RLS hides what the caller cannot reach. */
export async function getProject(userId: string, slug: string): Promise<ProjectSettings | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      id: string
      slug: string
      name: string
      learning_enabled: boolean
      llm_provider_id: string | null
      is_owner: boolean
      rank: number | null
    }>(
      `SELECT p.id, p.slug, p.name, p.learning_enabled, p.llm_provider_id,
              (p.owner_user_id = $1) AS is_owner,
              ${GRANT_RANK} AS rank
         FROM projects p
        WHERE p.archived_at IS NULL AND p.slug = $2
        LIMIT 1`,
      [userId, slug],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      learningEnabled: row.learning_enabled,
      llmProviderId: row.llm_provider_id,
      role: row.is_owner ? 'owner' : (rankRole(row.rank)),
    }
  })
}

export type ProjectHealth = { memories: number; summarised: number; embedded: number }

/**
 * What the memory actually looks like to a reader: how many paths there are,
 * how many carry a summary, and how many can be found by vector search. The
 * three counts are what makes a half-learned project visible instead of silent.
 */
export async function getProjectHealth(userId: string, projectId: string): Promise<ProjectHealth> {
  await requireProjectRole(userId, projectId, 'read')

  return withUser(userId, async (client) => {
    const { rows } = await client.query<ProjectHealth>(
      `SELECT count(*)::int AS memories,
              count(*) FILTER (WHERE summary IS NOT NULL)::int AS summarised,
              count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
         FROM memories
        WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId],
    )
    return rows[0] ?? { memories: 0, summarised: 0, embedded: 0 }
  })
}

/**
 * Project settings belong to the owner: the provider change spends the owner's
 * key, and the RLS update policy is owner-only, so a write grantee would get a
 * silent no-op. Requiring owner keeps the answer honest.
 */
export async function updateProjectSettings(
  userId: string,
  projectId: string,
  patch: { learningEnabled?: boolean; llmProviderId?: string | null },
): Promise<void> {
  await requireProjectRole(userId, projectId, 'owner')
  const providerChanged = patch.llmProviderId !== undefined

  await withUser(userId, async (client) => {
    const result = await client.query(
      `UPDATE projects
          SET learning_enabled = COALESCE($2::boolean, learning_enabled),
              llm_provider_id = CASE WHEN $3::boolean THEN $4::uuid ELSE llm_provider_id END
        WHERE id = $1`,
      [projectId, patch.learningEnabled ?? null, providerChanged, patch.llmProviderId ?? null],
    )
    if (result.rowCount === 0) {
      throw forbidden('Only the project owner can change that.')
    }
  })

  // Turning learning on must reach memories written while it was off. A write
  // only queues extraction for itself, so the backlog would otherwise sit
  // unsummarised until someone happened to edit that project again.
  if (patch.learningEnabled === true) await enqueueExtraction(projectId)
}

/**
 * Archiving hides a project everywhere `archived_at IS NULL` is checked - lists,
 * `getProject`, and therefore every page and API call - while keeping its rows.
 * Only the owner may do it, and it is reversible, because an archive nobody can
 * undo is a deletion with extra steps.
 */
export async function archiveProject(userId: string, projectId: string): Promise<void> {
  await setArchived(userId, projectId, true)
}

export async function restoreProject(userId: string, projectId: string): Promise<void> {
  await setArchived(userId, projectId, false)
}

async function setArchived(userId: string, projectId: string, archived: boolean): Promise<void> {
  const role = await projectRole(userId, projectId, { includeArchived: true })
  if (role !== 'owner') throw forbidden('Only the project owner can change that.')

  await withUser(userId, async (client) => {
    const result = await client.query(
      `UPDATE projects
          SET archived_at = CASE WHEN $2::boolean THEN now() ELSE NULL END
        WHERE id = $1`,
      [projectId, archived],
    )
    if (result.rowCount === 0) {
      throw forbidden('Only the project owner can change that.')
    }
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: archived ? 'project.archive' : 'project.restore',
        targetType: 'project',
        targetId: projectId,
      },
      client,
    )
  })
}
