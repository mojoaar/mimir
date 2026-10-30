import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { translator } from '@/lib/i18n/request'
import { myAccessRequests } from '@/lib/projects/requests'

import { requestAccessAction } from './actions'

export const instant = false

const FIELD =
  'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]'

/**
 * Asking is the only way onto a repository that already has a project: the
 * owner's copy is invisible to anyone without a grant, so a session cannot
 * discover it, and creating one would split the knowledge in two.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { notice, error } = await searchParams
  const mine = await myAccessRequests(user.id)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-1">
        <Link href="/app" className="text-sm text-[var(--accent)] underline">
          {t('app.nav.projects')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('app.requests.title')}</h1>
      </div>

      {notice ? <p className="text-sm text-[var(--accent)]">{notice}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t('app.requests.body')}</p>

      <form action={requestAccessAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.requests.repo')}</span>
          <input name="repo" placeholder="github.com/you/project" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.requests.note')}</span>
          <input name="note" placeholder={t('app.requests.notePlaceholder')} className={FIELD} />
        </label>
        <button
          type="submit"
          className="w-fit rounded-md border border-[var(--accent)] bg-[var(--bg-raised)] px-4 py-2 text-sm font-medium"
        >
          {t('app.requests.request')}
        </button>
      </form>

      {mine.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t('app.requests.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm"
            >
              <span className="font-mono text-xs">{request.repoKey}</span>
              {request.note ? (
                <span className="text-[var(--text-muted)]">{request.note}</span>
              ) : null}
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {t(`app.requests.${request.decision ?? 'pending'}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
