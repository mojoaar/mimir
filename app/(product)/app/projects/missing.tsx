import Link from 'next/link'

import type { Translate } from '@/lib/i18n/request'

/**
 * Next streams the shell of a dynamic route before `notFound()` resolves, so a
 * status of 404 is not reachable from inside a page here. Rendering the same
 * message without the throw is honest about that: the page says there is
 * nothing, the response says 200, and no crawler is told a lie it can index -
 * product routes also carry `noindex`.
 */
export function Missing({ kind, t }: { kind: 'project' | 'memory'; t: Translate }) {
  return (
    <main className="mx-auto max-w-[72ch] px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{t('app.missing.title')}</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        {t('app.missing.body', { what: t(`app.missing.${kind}`) })}
      </p>
      <p className="mt-6">
        <Link href="/app" className="text-[var(--accent)] underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          {t('app.missing.back')}
        </Link>
      </p>
    </main>
  )
}
