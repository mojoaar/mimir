import { withAdmin } from '../db/tx'

export type AuditFilters = {
  action?: string
  actorId?: string
  actorType?: string
  /** A calendar day in the install's zone, `YYYY-MM-DD`. */
  fromDay?: string
  toDay?: string
  timeZone: string
  text?: string
  limit?: number
  offset?: number
}

export type AuditRow = {
  id: string
  createdAt: Date
  actorType: string
  actorId: string | null
  actorEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  detail: unknown
  ip: string | null
}

type Row = {
  id: string
  created_at: Date
  actor_type: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: unknown
  ip: string | null
}

function toRow(row: Row): AuditRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    ip: row.ip,
  }
}

/** Filters are ANDed; an omitted filter is not applied. */
export async function listAudit(
  filters: AuditFilters,
): Promise<{ rows: AuditRow[]; total: number }> {
  const values: unknown[] = []
  const where: string[] = []

  const add = (sql: (index: number) => string, value: unknown) => {
    values.push(value)
    where.push(sql(values.length))
  }

  if (filters.action) add((i) => `a.action = $${i}`, filters.action)
  if (filters.actorId) add((i) => `a.actor_id = $${i}`, filters.actorId)
  if (filters.actorType) add((i) => `a.actor_type = $${i}`, filters.actorType)
  // The day is a calendar day where the reader is, so the zone travels with it.
  if (isDay(filters.fromDay)) {
    values.push(filters.fromDay, filters.timeZone)
    where.push(
      `a.created_at >= ($${values.length - 1}::date::timestamp at time zone $${values.length})`,
    )
  }
  if (isDay(filters.toDay)) {
    values.push(filters.toDay, filters.timeZone)
    where.push(
      `a.created_at < (($${values.length - 1}::date + 1)::timestamp at time zone $${values.length})`,
    )
  }
  if (filters.text) {
    add((i) => `(a.action ilike $${i} or a.target_id ilike $${i} or a.detail::text ilike $${i})`,
      `%${filters.text}%`)
  }

  const clause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  // 10k is the CSV export's ceiling; the page passes 50.
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 10_000)
  const offset = Math.max(filters.offset ?? 0, 0)

  return withAdmin(async (client) => {
    const counted = await client.query<{ count: string }>(
      `select count(*) from audit_log a ${clause}`,
      values,
    )
    const listed = await client.query<Row>(
      `select a.id, a.created_at, a.actor_type, a.actor_id, u.email as actor_email,
              a.action, a.target_type, a.target_id, a.detail,
              host(a.ip) as ip
         from audit_log a
         left join users u on u.id = a.actor_id
         ${clause}
        order by a.created_at desc, a.id desc
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, limit, offset],
    )
    return { rows: listed.rows.map(toRow), total: Number(counted.rows[0]?.count ?? 0) }
  })
}

function isDay(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Which actions exist, so the filter can offer them instead of demanding the exact name. */
export async function listAuditActions(): Promise<{ action: string; count: number }[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ action: string; count: number }>(
      'select action, count(*)::int as count from audit_log group by 1 order by 1',
    ),
  )
  return rows
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const CSV_HEADER = [
  'id',
  'created_at',
  'actor_type',
  'actor_id',
  'actor_email',
  'action',
  'target_type',
  'target_id',
  'ip',
  'detail',
]

export function toCsv(rows: readonly AuditRow[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const row of rows) {
    const fields = [
      row.id,
      row.createdAt.toISOString(),
      row.actorType,
      row.actorId ?? '',
      row.actorEmail ?? '',
      row.action,
      row.targetType ?? '',
      row.targetId ?? '',
      row.ip ?? '',
      JSON.stringify(row.detail ?? null),
    ]
    lines.push(fields.map((field) => quote(String(field))).join(','))
  }
  return `${lines.join('\n')}\n`
}
