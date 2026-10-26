import { requireAdmin } from '@/lib/auth/admin'
import { translator } from '@/lib/i18n/request'
import { breakdown, daily, failures, hourly, people, spend } from '@/lib/usage/service'

export const instant = false

/** Small enough to need decimals, large enough that cents read better. */
function money(micros: number): string {
  const dollars = micros / 1_000_000
  return dollars > 0 && dollars < 1 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`
}

function Bar({ height, label }: { height: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1" title={label}>
      <div className="flex h-24 w-full items-end">
        <div
          className="w-full rounded-t bg-[var(--accent)]"
          style={{ height: `${Math.max(height, 1)}%` }}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-medium">{value}</div>
      {note && <div className="text-xs text-[var(--text-muted)]">{note}</div>}
    </div>
  )
}

export default async function UsagePage() {
  await requireAdmin()
  const t = await translator()
  const [month, days, hours, models, users, failed] = await Promise.all([
    spend(),
    daily(),
    hourly(),
    breakdown(),
    people(),
    failures(),
  ])

  const dayPeak = Math.max(...days.map((day) => day.micros), 1)
  const hourPeak = Math.max(...hours.map((hour) => hour.calls), 1)

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.usage.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.usage.intro')}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('app.usage.monthLlm')} value={money(month.llmMicros)} />
        <Stat label={t('app.usage.monthEmbedding')} value={money(month.embeddingMicros)} />
        <Stat label={t('app.usage.calls')} value={String(month.calls)} />
        <Stat
          label={t('app.usage.unpriced')}
          value={String(month.unpriced)}
          note={t('app.usage.unpricedNote')}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.usage.daily')}</h2>
        <div className="flex items-end gap-1">
          {days.map((day) => (
            <Bar
              key={day.day}
              height={Math.round((day.micros / dayPeak) * 100)}
              label={`${day.day} · ${money(day.micros)}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>{days[0]?.day}</span>
          <span>{days.at(-1)?.day}</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.usage.hourly')}</h2>
        <div className="flex items-end gap-1">
          {hours.map((hour) => (
            <Bar
              key={hour.hour}
              height={Math.round((hour.calls / hourPeak) * 100)}
              label={`${hour.hour} UTC · ${t('app.usage.callsCount', { count: hour.calls })}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>{hours[0]?.hour} UTC</span>
          <span>{hours.at(-1)?.hour} UTC</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.usage.byModel')}</h2>
        {models.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('app.usage.none')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--text-muted)]">
              <tr>
                <th className="py-1 font-normal">{t('app.usage.model')}</th>
                <th className="py-1 font-normal">{t('app.usage.kind')}</th>
                <th className="py-1 text-right font-normal">{t('app.usage.calls')}</th>
                <th className="py-1 text-right font-normal">{t('app.usage.spend')}</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row) => (
                <tr key={`${row.preset}-${row.kind}-${row.model}`} className="border-t border-[var(--border)]">
                  <td className="py-1">
                    {row.model} <span className="text-[var(--text-muted)]">· {row.preset}</span>
                  </td>
                  <td className="py-1">{t(`app.usage.kind.${row.kind}`)}</td>
                  <td className="py-1 text-right">{row.calls}</td>
                  <td className="py-1 text-right">{money(row.micros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.usage.byPerson')}</h2>
        {users.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('app.usage.none')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {users.map((row) => (
              <li key={row.email} className="flex justify-between border-t border-[var(--border)] py-1">
                <span>{row.email}</span>
                <span className="text-[var(--text-muted)]">
                  {t('app.usage.callsCount', { count: row.calls })} · {money(row.micros)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.usage.failures')}</h2>
        {failed.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('app.usage.noFailures')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {failed.map((row, index) => (
              <li key={`${row.at}-${index}`} className="border-t border-[var(--border)] py-1">
                <span className="text-[var(--danger)]">{row.status ?? t('app.usage.noStatus')}</span>{' '}
                {row.model} · {row.purpose}
                <span className="text-[var(--text-muted)]">
                  {' '}
                  · {new Date(row.at).toISOString().slice(0, 16).replace('T', ' ')} UTC
                  {row.email ? ` · ${row.email}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
