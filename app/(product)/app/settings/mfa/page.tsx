import { requireUser } from '@/lib/auth/context'
import { mfaEnabled } from '@/lib/auth/mfa'
import { getRequireMfa } from '@/lib/settings/security'
import { disableMfaAction } from './actions'
import { Enrolment } from './enrolment'

export const instant = false

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const user = await requireUser()
  const { notice, error } = await searchParams
  const on = await mfaEnabled(user.id)
  const required = await getRequireMfa()

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A six-digit code from an authenticator app, on top of your password.
        </p>
      </div>

      {notice === 'off' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          Two-factor authentication is off.
        </p>
      ) : null}
      {error === 'required' ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          This install requires two-factor authentication, so it cannot be turned off.
        </p>
      ) : null}

      {on ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm">
            Two-factor authentication is <strong>on</strong>.
          </p>
          {required ? (
            <p className="text-sm text-[var(--text-muted)]">
              This install requires it, so turning it off is disabled.
            </p>
          ) : (
            <form action={disableMfaAction}>
              <button
                type="submit"
                className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]"
              >
                Turn off
              </button>
            </form>
          )}
        </div>
      ) : (
        <Enrolment userId={user.id} />
      )}
    </section>
  )
}
