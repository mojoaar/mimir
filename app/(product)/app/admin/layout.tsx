import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'

export const instant = false

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-raised)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <span className="font-medium">Admin</span>
          <Link href="/app/admin/settings" className="text-[var(--text-muted)] underline">
            Embeddings
          </Link>
          <Link href="/app" className="ml-auto text-[var(--text-muted)] underline">
            Back to app
          </Link>
          <span className="text-[var(--text-muted)]">{user.email}</span>
        </div>
      </header>
      {children}
    </div>
  )
}
