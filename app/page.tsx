import Link from 'next/link'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from './theme-switcher'

export const instant = false

export default async function Home() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Mimir</h1>
      <p className="text-[var(--text-muted)]">
        Long-term memory for your coding agents. Self-hosted, inspectable, and shared across every
        agent that speaks MCP.
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link
          href="/login"
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Sign in
        </Link>
        <ThemeSwitcher value={theme} />
      </div>
    </main>
  )
}
