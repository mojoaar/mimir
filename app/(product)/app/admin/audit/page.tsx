import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { listAudit, listAuditActions, type AuditRow } from '@/lib/audit/query'
import { AUDIT_READ_RETENTION_DAYS, AUDIT_RETENTION_DAYS } from '@/lib/audit/retention'
import { stamp } from '@/lib/format/time'
import { translator } from '@/lib/i18n/request'
import { getTimeFormat } from '@/lib/settings/time'

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
  const { timeZone, clock } = await getTimeFormat()
  const search = await searchParams
  const page = Math.max(Number(search.page ?? '1') || 1, 1)

  const [{ rows, total }, actions] = await Promise.all([
    listAudit({
      action: search.action?.trim() || undefined,
      text: search.q?.trim() || undefined,
      fromDay: search.from || undefined,
      toDay: search.to || undefined,
      timeZone,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listAuditActions(),
  ])

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const groups = new Map<string, { action: string; count: number }[]>()
  for (const entry of actions) {
    const group = entry.action.includes('.') ? entry.action.split('.')[0]! : 'other'
    groups.set(group, [...(groups.get(group) ?? []), entry])
  }
  const kept = search.action && !actions.some((entry) => entry.action === search.action)

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

      <p className="text-sm text-[var(--text-muted)]">
        {t('app.admin.audit.retention', {
          kept: AUDIT_RETENTION_DAYS,
          reads: AUDIT_READ_RETENTION_DAYS,
        })}
      </p>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.audit.action')}</span>
          <select
            name="action"
            defaultValue={search.action ?? ''}
            className="rounded border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          >
            <option value="">{t('app.admin.audit.allActions')}</option>
            {kept && <option value={search.action}>{search.action}</option>}
            {[...groups.entries()].map(([group, entries]) => (
              <optgroup key={group} label={group}>
                {entries.map((entry) => (
                  <option key={entry.action} value={entry.action}>
                    {entry.action} ({entry.count})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
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
                  {stamp(row.createdAt, timeZone, { clock, seconds: true })}
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
