import { cookies } from 'next/headers'

import { requireUser } from '@/lib/auth/context'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { sessionIdFor } from '@/lib/auth/session'
import { listMySessions } from '@/lib/users/self'
import { ProfileForm } from './profile-form'
import { PasswordForm } from './password-form'
import { revokeSessionAction, signOutEverywhereElseAction } from './actions'

export const instant = false

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const user = await requireUser()
  const { notice, error } = await searchParams
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  const currentSessionId = (await sessionIdFor(cookieValue)) ?? ''
  const sessions = await listMySessions(user.id, currentSessionId)

  return (
    <section className="flex max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Your name, the address you sign in with, and your password.
        </p>
      </div>

      {notice === 'revoked' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          That session is signed out.
        </p>
      ) : null}
      {notice === 'others' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          Every other device is signed out.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Name and email</h2>
        <ProfileForm user={user} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Password</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Changing it signs out every other device, and keeps this one.
        </p>
        <PasswordForm />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Sessions</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Every browser and agent signed in as you. Revoke one you do not recognise.
        </p>

        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="flex flex-col">
                <span>
                  {session.ip ?? 'an unknown address'}
                  {session.current ? (
                    <span className="ml-2 rounded border border-[var(--accent)] px-1.5 py-0.5 text-xs text-[var(--accent)]">
                      This session
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {session.userAgent ?? 'unknown device'} · last seen{' '}
                  {session.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              </span>

              {session.current ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)]"
                  >
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {sessions.length > 1 ? (
          <form action={signOutEverywhereElseAction}>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Sign out everywhere else
            </button>
          </form>
        ) : null}
      </div>
    </section>
  )
}
