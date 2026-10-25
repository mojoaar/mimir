import { requireAdmin } from '@/lib/auth/admin'
import { listAudit, toCsv } from '@/lib/audit/query'

export const instant = false

const MAX_ROWS = 10_000

/** Same filters as the page, capped so one click cannot stream the whole table. */
export async function GET(request: Request): Promise<Response> {
  await requireAdmin()
  const params = new URL(request.url).searchParams
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const { rows } = await listAudit({
    action: params.get('action')?.trim() || undefined,
    text: params.get('q')?.trim() || undefined,
    from: params.get('from') ? new Date(`${params.get('from')}T00:00:00Z`) : undefined,
    to: params.get('to') ? new Date(`${params.get('to')}T23:59:59Z`) : undefined,
    limit: MAX_ROWS,
    offset: 0,
  })

  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="mimir-audit-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
