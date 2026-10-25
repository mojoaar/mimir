import { loginAction } from './actions'

const MESSAGES: Record<string, string> = {
  invalid: 'Invalid email or password.',
  pending: 'This account is waiting for an administrator to verify it.',
  disabled: 'This account has been disabled.',
  locked: 'Too many attempts. Try again in a few minutes.',
}

export const instant = false

const FIELD =
  'rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 font-normal text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? (MESSAGES[error] ?? 'Sign in failed.') : null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Mimir</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Long-term memory for your agents.</p>
      </div>

      {message ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {message}
        </p>
      ) : null}

      <form action={loginAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Sign in
        </button>
      </form>
    </main>
  )
}
