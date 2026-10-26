import Link from 'next/link'
import { UsageAlert } from '@/app/usage-alert'
import { requireAdmin } from '@/lib/auth/admin'
import { translator } from '@/lib/i18n/request'

export const instant = false

/**
 * A row of buttons, not a second header: the app shell already shows the nav,
 * the account and sign-out. This only adds the admin destinations, so it reads
 * as a subsection of the page below it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const t = await translator()

  const button =
    'rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

  return (
    <div className="flex-1">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
        <Link href="/app/admin" className={button}>
          {t('app.admin.nav.admin')}
        </Link>
        <Link href="/app/admin/users" className={button}>
          {t('app.admin.nav.users')}
        </Link>
        <Link href="/app/admin/settings" className={button}>
          {t('app.admin.nav.embeddings')}
        </Link>
        <Link href="/app/admin/backups" className={button}>
          {t('app.admin.nav.backups')}
        </Link>
        <Link href="/app/admin/audit" className={button}>
          {t('app.admin.nav.audit')}
        </Link>
        <Link href="/app/admin/settings/site" className={button}>
          {t('app.admin.nav.site')}
        </Link>
        <Link href="/app/admin/usage" className={button}>
          {t('app.admin.nav.usage')}
        </Link>
      </nav>
      <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:px-6">
        {await UsageAlert({ userId: admin.id })}
      </div>
      {children}
    </div>
  )
}
