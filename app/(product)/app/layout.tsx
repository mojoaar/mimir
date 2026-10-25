import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/context'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from '@/app/theme-switcher'

export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real session check. Middleware only sees that a cookie exists.
  const user = await requireUser()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

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
      {children}
    </>
  )
}
