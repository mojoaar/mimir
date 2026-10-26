import Link from 'next/link'
import { translator } from '@/lib/i18n/request'
import { dismissed, spike } from '@/lib/usage/service'
import { dismissUsageSpikeAction } from './usage-alert-actions'

/**
 * A quiet warning, not a page: an admin sees it only while the current hour is
 * genuinely unusual, and the × keeps it out of the way for that hour.
 */
export async function UsageAlert({ userId }: { userId: string }) {
  const found = await spike()
  if (!found) return null
  if (await dismissed(userId, found.hourStart)) return null

  const t = await translator()

  return (
    <span className="inline-flex items-center gap-1 rounded border border-[var(--danger)] px-2 py-0.5 text-xs">
      <Link href="/app/admin/usage" className="text-[var(--danger)] underline">
        {t('app.usage.alert', { count: found.calls })}
      </Link>
      <form action={dismissUsageSpikeAction} className="inline">
        <button
          type="submit"
          aria-label={t('app.usage.dismiss')}
          className="px-1 text-[var(--text-muted)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          ×
        </button>
      </form>
    </span>
  )
}
