import { requireAdmin } from '@/lib/auth/admin'
import { stamp } from '@/lib/format/time'
import { translator } from '@/lib/i18n/request'
import {
  embeddingCalls,
  embeddingCoverage,
  jobCounts,
  queueHealth,
  recentJobs,
} from '@/lib/jobs/service'
import { getEmbeddingConfig } from '@/lib/settings/embedding'
import { getTimeFormat } from '@/lib/settings/time'

export const instant = false

function seconds(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  return `${((end.getTime() - start.getTime()) / 1000).toFixed(1)}s`
}

export default async function JobsPage() {
  await requireAdmin()
  const t = await translator()
  const { timeZone, clock } = await getTimeFormat()

  const [health, counts, jobs, coverage, calls, config] = await Promise.all([
    queueHealth(),
    jobCounts(7),
    recentJobs(50),
    embeddingCoverage(),
    embeddingCalls(24),
    getEmbeddingConfig(),
  ])

  const running = health.started
  const stale = coverage.models.filter(
    (group) => group.model === 'unknown' || (config?.model ? group.model !== config.model : false),
  )
  const percent = coverage.total === 0 ? 100 : Math.round((coverage.embedded / coverage.total) * 100)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.jobs.title')}</h1>
      </section>

      {!running ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          {t('app.jobs.queueStopped')}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{t('app.jobs.queueRunning')}</p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.jobs.coverage')}</h2>
        <div className="flex h-3 w-full overflow-hidden rounded bg-[var(--bg-raised)]">
          <div className="bg-[var(--accent)]" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm">
          {t('app.jobs.embeddedOf', { embedded: coverage.embedded, total: coverage.total })}
          {coverage.missing > 0 ? ` · ${t('app.jobs.missing', { count: coverage.missing })}` : ''}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          {coverage.lastEmbeddedAt
            ? t('app.jobs.lastEmbedded', {
                when: stamp(coverage.lastEmbeddedAt, timeZone, { clock }),
              })
            : t('app.jobs.neverEmbedded')}
        </p>
        {coverage.models.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs">
            {coverage.models.map((group) => (
              <li
                key={group.model}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text-muted)]"
              >
                {group.model} · {group.count}
              </li>
            ))}
          </ul>
        ) : null}
        {stale.length > 0 && config ? (
          <p className="text-sm text-[var(--danger)]">
            {t('app.jobs.staleModel', {
              count: stale.reduce((sum, group) => sum + group.count, 0),
            })}{' '}
            <a className="underline" href="/app/admin/settings">
              {t('app.jobs.reembed')}
            </a>
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.jobs.calls')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.jobs.callsHint')}</p>
        {calls.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('app.jobs.none')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {calls.map((call) => (
              <li
                key={call.purpose}
                className="flex justify-between border-t border-[var(--border)] py-1"
              >
                <span>{call.purpose}</span>
                <span className="text-[var(--text-muted)]">
                  {call.count}
                  {call.failures > 0 ? (
                    <span className="text-[var(--danger)]"> · {call.failures}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {running ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t('app.jobs.byJob')}</h2>
          {counts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('app.jobs.none')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--text-muted)]">
                <tr>
                  <th className="py-1 font-normal">{t('app.jobs.job')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.state')}</th>
                  <th className="py-1 text-right font-normal">{t('app.jobs.count')}</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((row) => (
                  <tr
                    key={`${row.name}-${row.state}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="py-1">{row.name}</td>
                    <td className="py-1">{row.state}</td>
                    <td className="py-1 text-right">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {running ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t('app.jobs.recent')}</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('app.jobs.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--text-muted)]">
                <tr>
                  <th className="py-1 font-normal">{t('app.jobs.job')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.state')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.created')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.duration')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.tries')}</th>
                  <th className="py-1 font-normal">{t('app.jobs.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[var(--border)] align-top">
                    <td className="py-1">{job.name}</td>
                    <td className="py-1">{job.state}</td>
                    <td className="py-1 text-[var(--text-muted)]">
                      {stamp(job.createdAt, timeZone, { clock })}
                    </td>
                    <td className="py-1 text-[var(--text-muted)]">
                      {seconds(job.startedAt, job.completedAt)}
                    </td>
                    <td className="py-1 text-[var(--text-muted)]">
                      {job.retryCount}/{job.retryLimit}
                    </td>
                    <td className="max-w-[22rem] break-words py-1 text-[var(--text-muted)]">
                      {job.detail ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </main>
  )
}
