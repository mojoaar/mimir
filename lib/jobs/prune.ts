import { AUDIT_READ_RETENTION_DAYS, AUDIT_RETENTION_DAYS } from '../audit/retention'
import { withAdmin } from '../db/tx'
import { registerWorker } from './boss'

export type PruneResult = { reads: number; other: number }

/**
 * Ages the audit log out: memory traffic is the bulk and keeps four weeks, the
 * auth and admin trail keeps a year.
 *
 * The delete needs `mimir.allow_audit_prune='on'` because the table is
 * append-only by trigger; without it the statement is refused rather than
 * silently doing nothing.
 */
export async function runPrune(now: Date = new Date()): Promise<PruneResult> {
  return withAdmin(async (client) => {
    await client.query(`select set_config('mimir.allow_audit_prune', 'on', true)`)
    const reads = await client.query(
      `delete from audit_log
        where action like 'memory.read%'
          and created_at < $1::timestamptz - ($2 || ' days')::interval`,
      [now, AUDIT_READ_RETENTION_DAYS],
    )
    const other = await client.query(
      `delete from audit_log
        where action not like 'memory.read%'
          and created_at < $1::timestamptz - ($2 || ' days')::interval`,
      [now, AUDIT_RETENTION_DAYS],
    )
    return { reads: reads.rowCount ?? 0, other: other.rowCount ?? 0 }
  })
}

registerWorker('prune', async () => {
  const result = await runPrune()
  console.log(`mimir: pruned ${result.reads} read row(s) and ${result.other} other row(s)`)
})
