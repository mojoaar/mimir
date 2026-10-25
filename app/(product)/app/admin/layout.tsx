import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { translator } from '@/lib/i18n/request'

export const instant = false

/**
 * A strip, not a second header: the app shell already shows the nav, the
 * account and sign-out. This only adds the admin destinations, in muted text
 * so it reads as a subsection of the page below it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const t = await translator()

  const link = 'text-[var(--text-muted)] underline hover:text-[var(--fg)]'

  return (
    <div className="flex-1">
      <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-xs sm:px-6">
        <Link href="/app/admin" className={link}>
          {t('app.admin.nav.admin')}
        </Link>
        <Link href="/app/admin/users" className={link}>
          {t('app.admin.nav.users')}
        </Link>
        <Link href="/app/admin/settings" className={link}>
          {t('app.admin.nav.embeddings')}
        </Link>
        <Link href="/app/admin/backups" className={link}>
          {t('app.admin.nav.backups')}
        </Link>
        <Link href="/app/admin/audit" className={link}>
          {t('app.admin.nav.audit')}
        </Link>
        <Link href="/app/admin/settings/site" className={link}>
          {t('app.admin.nav.site')}
        </Link>
      </nav>
      {children}
    </div>
  )
}
