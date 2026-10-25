import { adminPool } from '@/lib/db/pool'
import { resolveEmbeddingProvider } from '@/lib/providers/resolve'
import { registerWorker } from './boss'
import { runBackfill } from './backfill'

export type ReembedData = { confirm: true }
export type ReembedResult = { total: number; missing: number }

function invalidParams(message: string): Error & { code: 'invalid_params' } {
  return Object.assign(new Error(message), { code: 'invalid_params' as const })
}

/**
 * Drops every live vector so the backfill job can rebuild it in the new space.
 * Runs the backfill inline: a model change is a rare, admin-initiated action and
 * the caller wants to know it finished, not that it was queued.
 * withAdmin, not withService: a sessionless app_user_id() hides every memory row.
 */
export async function runReembed(data: ReembedData): Promise<ReembedResult> {
  if (data.confirm !== true) throw invalidParams('re-embedding needs an explicit confirm')

  // Resolve before dropping anything: without a working provider every vector
  // would be destroyed and only the log would know.
  const provider = await resolveEmbeddingProvider()
  if (!provider) throw invalidParams('no embedding provider is configured')

  const { rowCount } = await adminPool().query(
    `update memories set embedding = null where deleted_at is null`,
  )
  await runBackfill({})

  // A provider that failed mid-run leaves rows empty; say so instead of
  // reporting a clean rebuild.
  const { rows } = await adminPool().query<{ missing: string }>(
    `select count(*)::text as missing from memories where embedding is null and deleted_at is null`,
  )
  const missing = Number(rows[0]?.missing ?? 0)
  if (missing > 0) {
    throw new Error(`${missing} memories are still without a vector; run re-embed again`)
  }

  return { total: rowCount ?? 0, missing }
}

registerWorker('reembed', async (data) => {
  await runReembed(data as ReembedData)
})
