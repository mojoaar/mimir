import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { requireUser } from '@/lib/auth/context'
import { isRequestAllowed } from '@/lib/http/allowlist'
import { mfaEnabled } from '@/lib/auth/mfa'
import { getConfig } from '@/lib/config'
import { getRequireMfa } from '@/lib/settings/security'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from '@/app/theme-switcher'
import AppFooter from '@/components/app/footer'
import { Enrolment } from './settings/mfa/enrolment'
import { signOutAction } from './actions'

export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real session check. Middleware only sees that a cookie exists.
  const user = await requireUser()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

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
      <section className="mx-auto flex max-w-md flex-col gap-3 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Not available here</h1>
        <p className="text-sm text-[var(--text-muted)]">
          This address is not allowed to reach Mimir. Ask the administrator which networks
          are permitted.
        </p>
      </section>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mb-8 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <nav className="flex flex-wrap gap-4">
            <Link href="/app">Projects</Link>
            <Link href="/app/teams">Teams</Link>
            <Link href="/app/settings">Settings</Link>
            <Link href="/app/settings/providers">Providers</Link>
            <Link href="/docs">Docs</Link>
            {user.role === 'admin' ? <Link href="/app/admin">Admin</Link> : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[var(--text-muted)]">{user.email}</span>
            <ThemeSwitcher value={theme} />
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-[var(--text-muted)] underline hover:text-[var(--fg)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {forced ? (
        <section className="flex max-w-xl flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Two-factor is required</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              This install requires an authenticator app before the app can be used.
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
