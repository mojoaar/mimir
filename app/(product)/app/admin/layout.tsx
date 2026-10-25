import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { translator } from '@/lib/i18n/request'

export const instant = false

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  const t = await translator()

  return (
    <div className="flex-1">
      <header className="border-b border-[var(--border)] bg-[var(--bg-raised)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <span className="font-medium">{t('app.admin.nav.admin')}</span>
          <Link href="/app/admin/users" className="text-[var(--text-muted)] underline">
            {t('app.admin.nav.users')}
          </Link>
          <Link href="/app/admin/settings" className="text-[var(--text-muted)] underline">
            {t('app.admin.nav.embeddings')}
          </Link>
          <Link href="/app/admin/backups" className="text-[var(--text-muted)] underline">
            {t('app.admin.nav.backups')}
          </Link>
          <Link href="/app/admin/audit" className="text-[var(--text-muted)] underline">
            {t('app.admin.nav.audit')}
          </Link>
          <Link href="/app/admin/settings/site" className="text-[var(--text-muted)] underline">
            {t('app.admin.nav.site')}
          </Link>
          <Link href="/app" className="ml-auto text-[var(--text-muted)] underline">
            {t('app.admin.nav.back')}
          </Link>
          <span className="text-[var(--text-muted)]">{user.email}</span>
        </div>
      </header>
      {children}
    </div>
  )
}
