import Link from 'next/link'
import { requireUser } from '@/lib/auth/context'

export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real session check. Middleware only sees that a cookie exists.
  const user = await requireUser()
  return (
    <>
      <header className="mb-8 flex items-center justify-between border-b border-[var(--border)] pb-3 text-sm">
        <nav className="flex gap-4">
          <Link href="/app">Projects</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <span className="text-[var(--text-muted)]">{user.email}</span>
      </header>
      {children}
    </>
  )
}
