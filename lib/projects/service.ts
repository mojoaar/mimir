import type { PoolClient } from 'pg'

import { withUser } from '@/lib/db/tx'

import { requireProjectRole } from './access'
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
  grant_role: string | null
}

const ACCESSIBLE = `
  p.archived_at IS NULL
  AND (
    p.owner_user_id = $1
    OR EXISTS (
      SELECT 1 FROM project_grants g
      WHERE g.project_id = p.id AND g.principal_type = 'user' AND g.principal_id = $1
    )
  )
`

function toRole(row: AccessRow): ProjectRole {
  if (row.is_owner) return 'owner'
  return row.grant_role === 'write' ? 'write' : 'read'
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
                (SELECT g.role::text FROM project_grants g
                  WHERE g.project_id = p.id AND g.principal_type = 'user' AND g.principal_id = $1) AS grant_role
           FROM projects p
          WHERE ${ACCESSIBLE} AND p.slug = $2
          LIMIT 1`,
        [userId, opts.project],
      )
      const row = found.rows[0]
      if (!row) throw new ProjectNotFoundError(opts.project)
      return { id: row.id, slug: row.slug, role: toRole(row) }
    }

    if (repoKey) {
      const found = await client.query<AccessRow>(
        `SELECT p.id, p.slug, (p.owner_user_id = $1) AS is_owner,
                (SELECT g.role::text FROM project_grants g
                  WHERE g.project_id = p.id AND g.principal_type = 'user' AND g.principal_id = $1) AS grant_role
           FROM projects p
          WHERE ${ACCESSIBLE} AND p.repo_key = $2
          ORDER BY (p.owner_user_id = $1) DESC, p.updated_at DESC
          LIMIT 1`,
        [userId, repoKey],
      )
      const row = found.rows[0]
      if (row) return { id: row.id, slug: row.slug, role: toRole(row) }
    }

    if (opts.create === false) throw new ProjectNotFoundError(opts.project ?? opts.repo ?? 'project')

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
): Promise<ResolvedProject> {
  const base = repoKey ? repoSlug(repoKey) : 'project'
  const name = repoKey && !repoKey.startsWith('local:') ? repoKey : base

  for (let attempt = 1; attempt <= 5; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO projects (owner_user_id, name, slug, repo_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (owner_user_id, slug) DO NOTHING
         RETURNING id`,
        [userId, name, slug, repoKey],
      )
      const row = inserted.rows[0]
      if (row) return { id: row.id, slug, role: 'owner' }
    } catch (error) {
      // Two clients created the same repo at once: adopt the winner.
      if ((error as { code?: string }).code !== '23505' || !repoKey) throw error
      const existing = await client.query<{ id: string; slug: string }>(
        'SELECT id, slug FROM projects WHERE owner_user_id = $1 AND repo_key = $2',
        [userId, repoKey],
      )
      const row = existing.rows[0]
      if (row) return { id: row.id, slug: row.slug, role: 'owner' }
    }
  }

  throw new Error(`could not allocate a project slug for ${repoKey ?? 'project'}`)
}

export type ProjectSummary = {
  slug: string
  name: string
  role: ProjectRole | null
  memoryCount: number
}/** Projects the caller owns or holds a grant on — RLS already hides the rest. */
export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      slug: string
      name: string
      owner_user_id: string
      grant_role: ProjectRole | null
      memory_count: number
    }>(
      `SELECT p.slug,
              p.name,
              p.owner_user_id,
              g.role AS grant_role,
              (SELECT count(*)::int FROM memories m
                WHERE m.project_id = p.id AND m.deleted_at IS NULL) AS memory_count
         FROM projects p
         LEFT JOIN project_grants g
                ON g.project_id = p.id
               AND g.principal_type = 'user'
               AND g.principal_id = $1
        WHERE p.archived_at IS NULL
        ORDER BY p.updated_at DESC`,
      [userId],
    )
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      role: row.owner_user_id === userId ? 'owner' : row.grant_role,
      memoryCount: row.memory_count,
    }))
  })
}

export type ProjectSettings = {
  id: string
  slug: string
  name: string
  learningEnabled: boolean
  llmProviderId: string | null
  role: ProjectRole
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
      grant_role: ProjectRole | null
    }>(
      `SELECT p.id, p.slug, p.name, p.learning_enabled, p.llm_provider_id,
              (p.owner_user_id = $1) AS is_owner,
              (SELECT g.role::text FROM project_grants g
                WHERE g.project_id = p.id AND g.principal_type = 'user' AND g.principal_id = $1) AS grant_role
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
      role: row.is_owner ? 'owner' : (row.grant_role ?? 'read'),
    }
  })
}

/**
 * Changing the provider spends the owner's key, so it needs owner; everything
 * else about the project only needs write.
 */
export async function updateProjectSettings(
  userId: string,
  projectId: string,
  patch: { learningEnabled?: boolean; llmProviderId?: string | null },
): Promise<void> {
  const providerChanged = patch.llmProviderId !== undefined
  await requireProjectRole(userId, projectId, providerChanged ? 'owner' : 'write')

  await withUser(userId, async (client) => {
    await client.query(
      `UPDATE projects
          SET learning_enabled = COALESCE($2::boolean, learning_enabled),
              llm_provider_id = CASE WHEN $3::boolean THEN $4::uuid ELSE llm_provider_id END
        WHERE id = $1`,
      [projectId, patch.learningEnabled ?? null, providerChanged, patch.llmProviderId ?? null],
    )
  })
}
