import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { listAudit, type AuditRow } from '@/lib/audit/query'
import { translator } from '@/lib/i18n/request'

export const instant = false

const PAGE_SIZE = 50

type Search = {
  action?: string
  actor?: string
  from?: string
  to?: string
  q?: string
  page?: string
}

function queryString(search: Search, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  for (const key of ['action', 'actor', 'from', 'to', 'q'] as const) {
    const value = search[key]
    if (value) params.set(key, value)
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  return params.toString()
}

function Detail({ row }: { row: AuditRow }) {
  if (row.detail === null || row.detail === undefined) return null
  const json = JSON.stringify(row.detail)
  return (
    <span className="block break-words text-xs text-[var(--text-muted)]">
      {json.length > 200 ? `${json.slice(0, 200)}…` : json}
    </span>
  )
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requireAdmin()
  const t = await translator()
  const search = await searchParams
  const page = Math.max(Number(search.page ?? '1') || 1, 1)

  const { rows, total } = await listAudit({
    action: search.action?.trim() || undefined,
    text: search.q?.trim() || undefined,
    from: search.from ? new Date(`${search.from}T00:00:00Z`) : undefined,
    to: search.to ? new Date(`${search.to}T23:59:59Z`) : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('app.admin.audit.title')}</h1>
        <Link
          href={`/app/admin/audit/export?${queryString(search)}`}
          className="rounded border px-3 py-1.5 text-sm underline"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('app.admin.audit.export')}
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.audit.action')}</span>
          <input
            name="action"
            defaultValue={search.action ?? ''}
            placeholder="memory.read"
            className="rounded border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.audit.from')}</span>
          <input
            type="date"
            name="from"
            defaultValue={search.from ?? ''}
            className="rounded border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.audit.to')}</span>
          <input
            type="date"
            name="to"
            defaultValue={search.to ?? ''}
            className="rounded border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.audit.search')}</span>
          <input
            name="q"
            defaultValue={search.q ?? ''}
            placeholder={t('app.admin.audit.searchPlaceholder')}
            className="rounded border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          />
        </label>
        <button
          type="submit"
          className="rounded px-3 py-1.5 font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t('app.admin.audit.filter')}
        </button>
      </form>

      <p className="text-sm text-[var(--text-muted)]">
        {t(total === 1 ? 'app.admin.audit.summaryOne' : 'app.admin.audit.summaryMany', {
          total,
          page,
          pages,
        })}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t('app.admin.audit.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded border p-3 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.action}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {row.createdAt.toISOString().replace('T', ' ').slice(0, 19)} UTC
                </span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {row.actorType}
                {row.actorEmail ? ` · ${row.actorEmail}` : ''}
                {row.targetType ? ` · ${row.targetType}` : ''}
                {row.targetId ? ` ${row.targetId}` : ''}
                {row.ip ? ` · ${row.ip}` : ''}
              </span>
              <Detail row={row} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-4 text-sm">
        {page > 1 ? (
          <Link href={`/app/admin/audit?${queryString(search, { page: String(page - 1) })}`} className="underline">
            {t('app.admin.audit.newer')}
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={`/app/admin/audit?${queryString(search, { page: String(page + 1) })}`} className="underline">
            {t('app.admin.audit.older')}
          </Link>
        ) : null}
      </div>
    </main>
  )
}
