import { adminPool } from '@/lib/db/pool'
import { registerWorker } from './boss'
import { runBackfill } from './backfill'

export type ReembedData = { confirm: true }
export type ReembedResult = { total: number }

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

  const { rowCount } = await adminPool().query(
    `update memories set embedding = null where deleted_at is null`,
  )
  await runBackfill({})
  return { total: rowCount ?? 0 }
}

registerWorker('reembed', async (data) => {
  await runReembed(data as ReembedData)
})
