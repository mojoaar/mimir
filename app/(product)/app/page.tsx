import { requireUser } from '@/lib/auth/context'
import { signOutAction } from './actions'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mimir</h1>
          <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm text-[var(--text-muted)] underline hover:text-[var(--fg)]"
          >
            Sign out
          </button>
        </form>
      </header>

      <p className="text-sm text-[var(--text-muted)]">
        No projects yet. Agents create one the first time they write a memory.
      </p>
    </main>
  )
}
