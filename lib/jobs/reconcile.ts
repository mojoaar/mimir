import { withAdmin } from '@/lib/db/tx'

import { registerWorker } from './boss'
import { enqueueBackfill, enqueueExtraction } from './enqueue'

export type ReconcileResult = { projects: number }

// A row can miss its summary after three failed extraction attempts, or its
// vector when the provider was down. Nothing else looks for either, so the
// install would carry that gap for ever.
const MISSING_SUMMARY = `
  select distinct p.id
    from projects p
    join memories m on m.project_id = p.id
   where p.archived_at is null and m.deleted_at is null and m.summary is null
`

const MISSING_VECTOR = `
  select distinct p.id
    from projects p
    join memories m on m.project_id = p.id
   where p.archived_at is null and m.deleted_at is null and m.embedding is null
`

type IdRow = { id: string }

/** Queues the two repair jobs, per project, for whatever is actually missing. */
export async function runReconcile(): Promise<ReconcileResult> {
  const [summaries, vectors] = await withAdmin(async (client) => {
    const summary = await client.query<IdRow>(MISSING_SUMMARY)
    const vector = await client.query<IdRow>(MISSING_VECTOR)
    return [summary.rows, vector.rows] as const
  })

  for (const row of summaries) await enqueueExtraction(row.id)
  for (const row of vectors) await enqueueBackfill(row.id)

  const projects = new Set([...summaries, ...vectors].map((row) => row.id))
  return { projects: projects.size }
}

export function registerReconcileWorker(): void {
  registerWorker('reconcile', async () => runReconcile())
}

registerReconcileWorker()
