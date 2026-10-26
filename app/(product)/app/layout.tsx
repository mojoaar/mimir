import Link from 'next/link'
import { headers } from 'next/headers'
import { requireUser } from '@/lib/auth/context'
import { isRequestAllowed } from '@/lib/http/allowlist'
import { mfaEnabled } from '@/lib/auth/mfa'
import { getConfig } from '@/lib/config'
import { getRequireMfa } from '@/lib/settings/security'
import AppFooter from '@/components/app/footer'
import { Enrolment } from './settings/mfa/enrolment'
import { signOutAction } from './actions'
import { UsageAlert } from '@/app/usage-alert'
import { UserMenu } from '@/app/user-menu'
import { avatarVersion } from '@/lib/users/avatar'
import { translator } from '@/lib/i18n/request'

export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real session check. Middleware only sees that a cookie exists.
  const user = await requireUser()
  const t = await translator()

  // The layout cannot see the pathname, so under require_mfa the whole app is
  // replaced by the enrolment form until the user is enrolled. The bootstrap
  // admin from env vars is exempt: a misconfigured install must not lock its
  // only operator out of the box.
  const forced =
    (await getRequireMfa()) &&
    !(await mfaEnabled(user.id)) &&
    user.email.toLowerCase() !== getConfig().adminEmail?.toLowerCase()

  // A valid session from a network that has since been disallowed stops here,
  // not at the next login.
  if (!(await isRequestAllowed({ headers: await headers() }))) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('app.layout.blocked')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.layout.blockedBody')}</p>
      </section>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mb-8 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <nav className="flex flex-wrap gap-4">
            <Link href="/app">{t('app.nav.projects')}</Link>
            <Link href="/app/teams">{t('app.nav.teams')}</Link>
            <Link href="/app/settings">{t('app.nav.settings')}</Link>
            <Link href="/app/settings/providers">{t('app.nav.providers')}</Link>
            {user.role === 'admin' ? (
              <Link href="/app/admin">{t('app.nav.admin')}</Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user.role === 'admin' ? await UsageAlert({ userId: user.id }) : null}
            <UserMenu
              email={user.email}
              avatarSrc={`/app/avatar?v=${await avatarVersion(user.id)}`}
              profile={t('app.user.profile')}
              signOutLabel={t('app.nav.signOut')}
              signOut={signOutAction}
            />
          </div>
        </div>
      </header>
      {forced ? (
        <section className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('app.layout.mfaRequired')}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t('app.layout.mfaRequiredBody')}
            </p>
          </div>
          <Enrolment userId={user.id} />
        </section>
      ) : (
        children
      )}
      <AppFooter />
    </div>
  )
}
