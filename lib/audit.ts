import type { PoolClient } from 'pg'
import { withAdmin, withUser } from './db/tx'
import { redact } from './crypto'

export type AuditEntry = {
  actorType: 'user' | 'agent' | 'system'
  actorId: string | null
  action: string
  targetType?: string
  targetId?: string
  detail?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

const SECRET_KEY = /key|secret|token|password|authorization/i

function redactDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDetail)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && v != null ? redact(String(v)) : redactDetail(v)
    }
    return out
  }
  return value
}

/**
 * The message must survive, or an operator cannot fix the failure; only the
 * credential-shaped parts of it are masked.
 */
export function describeAuditFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\b\w{16,}\b/g, (word) => redact(word))
}

/**
 * Append one audit row. Never throws: losing an audit write must not fail the
 * request it was describing, but it must be visible in the log.
 */
export async function audit(entry: AuditEntry, tx?: PoolClient): Promise<void> {
  const detail = redactDetail(entry.detail ?? {})
  const params = [
    entry.actorType,
    entry.actorId,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    JSON.stringify(detail),
    entry.ip ?? null,
    entry.userAgent ?? null,
  ]
  const insert = (client: PoolClient) =>
    client.query(
      `insert into audit_log
         (actor_type, actor_id, action, target_type, target_id, detail, ip, user_agent)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      params,
    )

  try {
    if (tx) await insert(tx)
    else if (entry.actorType === 'user' && entry.actorId) await withUser(entry.actorId, insert)
    else await withAdmin(insert)
  } catch (err) {
    console.error(`audit write failed (${describeAuditFailure(err)})`)
  }
}
