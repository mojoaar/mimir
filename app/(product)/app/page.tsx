import { requireUser } from '@/lib/auth/context'
import { signOutAction } from './actions'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mimir</h1>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-neutral-600 underline">
            Sign out
          </button>
        </form>
      </header>

      <p className="text-sm text-neutral-600">
        No projects yet. Agents create one the first time they write a memory.
      </p>
    </main>
  )
}
