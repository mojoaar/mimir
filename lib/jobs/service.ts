import { withAdmin } from '@/lib/db/tx'

export type JobRow = {
  id: string
  name: string
  state: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  retryCount: number
  retryLimit: number
  detail: string | null
}

export type Coverage = {
  total: number
  embedded: number
  missing: number
  lastEmbeddedAt: Date | null
  models: { model: string; count: number }[]
  projects: { id: string; slug: string; total: number; embedded: number }[]
}

type JobQuery = {
  id: string
  name: string
  state: string
  created_on: Date
  started_on: Date | null
  completed_on: Date | null
  retry_count: number
  retry_limit: number
  output: unknown
}

/** Whether there is a queue at all. "0 active, 0 failed" cannot tell you this. */
export async function queueHealth(): Promise<{ started: boolean }> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ started: boolean }>(`select to_regclass('pgboss.job') is not null as started`),
  )
  return { started: rows[0]?.started ?? false }
}

export async function jobCounts(days = 7): Promise<{ name: string; state: string; count: number }[]> {
  const { started } = await queueHealth()
  if (!started) return []
  const { rows } = await withAdmin((tx) =>
    tx.query<{ name: string; state: string; count: number }>(
      `select name, state::text as state, count(*)::int as count
         from pgboss.job
        where created_on >= now() - ($1 || ' days')::interval
        group by 1, 2
        order by 1, 2`,
      [String(days)],
    ),
  )
  return rows
}

export async function recentJobs(limit = 50): Promise<JobRow[]> {
  const { started } = await queueHealth()
  if (!started) return []
  const { rows } = await withAdmin((tx) =>
    tx.query<JobQuery>(
      `select id, name, state::text as state, created_on, started_on, completed_on,
              retry_count, retry_limit, output
         from pgboss.job
        order by created_on desc
        limit $1`,
      [Math.min(Math.max(limit, 1), 200)],
    ),
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    state: row.state,
    createdAt: row.created_on,
    startedAt: row.started_on,
    completedAt: row.completed_on,
    retryCount: row.retry_count,
    retryLimit: row.retry_limit,
    detail: detail(row.output),
  }))
}

/**
 * The message only. A failed fetch carries the provider URL in its stack, and a
 * mistyped URL can carry a key in its query string.
 */
function detail(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null
  const value = output as Record<string, unknown>
  const cause = value.cause as Record<string, unknown> | undefined
  const error = value.error as Record<string, unknown> | undefined
  const text =
    (typeof cause?.message === 'string' && cause.message) ||
    (typeof value.message === 'string' && value.message) ||
    (typeof error?.message === 'string' && error.message) ||
    (typeof value.embedded === 'number' && `${value.embedded} embedded`) ||
    JSON.stringify(value)
  return typeof text === 'string' ? text.slice(0, 200) : null
}

export async function embeddingCoverage(): Promise<Coverage> {
  return withAdmin(async (client) => {
    const counts = await client.query<{
      total: number
      embedded: number
      missing: number
      last_embedded_at: Date | null
    }>(
      `select count(*)::int as total,
              count(*) filter (where embedding is not null)::int as embedded,
              count(*) filter (where embedding is null)::int as missing,
              max(embedded_at) as last_embedded_at
         from memories
        where deleted_at is null`,
    )
    const models = await client.query<{ model: string; count: number }>(
      `select coalesce(embedding_model, 'unknown') as model, count(*)::int as count
         from memories
        where deleted_at is null
        group by 1
        order by 2 desc`,
    )
    const projects = await client.query<{
      id: string
      slug: string
      total: number
      embedded: number
    }>(
      `select p.id, p.slug, count(m.id)::int as total,
              count(m.embedding)::int as embedded
         from projects p
         left join memories m on m.project_id = p.id and m.deleted_at is null
        group by p.id, p.slug
        having count(m.id) > 0
        order by (count(m.id) - count(m.embedding)) desc, p.slug
        limit 20`,
    )
    const row = counts.rows[0]
    return {
      total: row?.total ?? 0,
      embedded: row?.embedded ?? 0,
      missing: row?.missing ?? 0,
      lastEmbeddedAt: row?.last_embedded_at ?? null,
      models: models.rows,
      projects: projects.rows,
    }
  })
}

export async function embeddingCalls(
  hours = 24,
): Promise<{ purpose: string; count: number; failures: number }[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ purpose: string; count: number; failures: number }>(
      `select purpose, count(*)::int as count, count(*) filter (where not ok)::int as failures
         from provider_calls
        where at >= now() - ($1 || ' hours')::interval
          and kind = 'embedding'
        group by 1
        order by 2 desc`,
      [String(hours)],
    ),
  )
  return rows
}
