import { headers } from 'next/headers'
import { cancelMfaAction, loginAction, loginMfaAction } from './actions'
import { isRequestAllowed } from '@/lib/http/allowlist'

const MESSAGES: Record<string, string> = {
  invalid: 'Invalid email or password.',
  pending: 'This account is waiting for an administrator to verify it.',
  disabled: 'This account has been disabled.',
  locked: 'Too many attempts. Try again in a few minutes.',
  expired: 'That took too long. Sign in again.',
  invalid_code: 'That code is not right. Check your authenticator and try again.',
  replayed: 'That code was already used. Wait for the next one.',
  not_enrolled: 'This account no longer has two-factor enabled. Sign in again.',
}

export const instant = false

const FIELD =
  'rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 font-normal text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string }>
}) {
  const { error, step } = await searchParams
  const message = error ? (MESSAGES[error] ?? 'Sign in failed.') : null

  if (!(await isRequestAllowed({ headers: await headers() }))) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Not available here</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            This address is not allowed to reach Mimir. Ask the administrator which networks
            are permitted.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 'code' ? 'Two-factor code' : 'Sign in to Mimir'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {step === 'code'
            ? 'Enter the six-digit code from your authenticator app.'
            : 'Long-term memory for your agents.'}
        </p>
      </div>

      {message ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {message}
        </p>
      ) : null}

      {step === 'code' ? (
        <>
          <form action={loginMfaAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Code
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                className={FIELD}
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)]"
            >
              Continue
            </button>
          </form>
          <form action={cancelMfaAction}>
            <button type="submit" className="text-sm text-[var(--text-muted)] underline">
              Start over
            </button>
          </form>
        </>
      ) : (
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
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)]"
          >
            Sign in
          </button>
        </form>
      )}
    </main>
  )
}
