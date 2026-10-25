import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { requireUser } from '@/lib/auth/context'
import { isRequestAllowed } from '@/lib/http/allowlist'
import { mfaEnabled } from '@/lib/auth/mfa'
import { getConfig } from '@/lib/config'
import { getRequireMfa } from '@/lib/settings/security'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from '@/app/theme-switcher'
import { Enrolment } from './settings/mfa/enrolment'

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
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 text-sm">
        <nav className="flex gap-4">
          <Link href="/app">Projects</Link>
          <Link href="/app/settings">Settings</Link>
          <Link href="/app/settings/providers">Providers</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)]">{user.email}</span>
          <ThemeSwitcher value={theme} />
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
    </>
  )
}
