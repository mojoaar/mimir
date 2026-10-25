import { cookies } from 'next/headers'

import { requireUser } from '@/lib/auth/context'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { sessionIdFor } from '@/lib/auth/session'
import { translator } from '@/lib/i18n/request'
import { listMySessions } from '@/lib/users/self'
import { ProfileForm } from './profile-form'
import { PasswordForm } from './password-form'
import { AvatarForm } from './avatar-form'
import { removeAvatarAction, revokeSessionAction, signOutEverywhereElseAction } from './actions'

export const instant = false

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { notice, error } = await searchParams
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  const currentSessionId = (await sessionIdFor(cookieValue)) ?? ''
  const sessions = await listMySessions(user.id, currentSessionId)

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('app.profile.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('app.profile.body')}</p>
      </div>

      {notice === 'revoked' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          {t('app.profile.revokedNotice')}
        </p>
      ) : null}
      {notice === 'others' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          {t('app.profile.othersNotice')}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.profile.avatar')}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/app/avatar"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
        />
        <AvatarForm
          labels={{
            hint: t('app.profile.avatarHint'),
            submit: t('app.profile.avatarSave'),
            pending: t('app.profile.avatarSaving'),
          }}
        />
        <form action={removeAvatarAction}>
          <button type="submit" className="text-sm text-[var(--text-muted)] underline">
            {t('app.profile.avatarRemove')}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.profile.nameAndEmail')}</h2>
        <ProfileForm
          user={user}
          labels={{
            name: t('app.profile.name'),
            email: t('app.profile.email'),
            currentPassword: t('app.profile.currentPassword'),
            currentPasswordHint: t('app.profile.currentPasswordHint'),
            save: t('app.profile.save'),
            saving: t('app.profile.saving'),
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.profile.password')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.profile.passwordBody')}</p>
        <PasswordForm
          labels={{
            currentPassword: t('app.profile.currentPassword'),
            newPassword: t('app.profile.newPassword'),
            confirmPassword: t('app.profile.confirmPassword'),
            passwordHint: t('app.profile.passwordHint'),
            changePassword: t('app.profile.changePassword'),
            changing: t('app.profile.changing'),
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.profile.sessions')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.profile.sessionsBody')}</p>

        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="flex flex-col">
                <span>
                  {session.ip ?? t('app.profile.unknownAddress')}
                  {session.current ? (
                    <span className="ml-2 rounded border border-[var(--accent)] px-1.5 py-0.5 text-xs text-[var(--accent)]">
                      {t('app.profile.thisSession')}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {session.userAgent ?? t('app.profile.unknownDevice')} ·{' '}
                  {t('app.profile.lastSeen', {
                    when: session.lastSeenAt.toISOString().slice(0, 16).replace('T', ' '),
                  })}
                </span>
              </span>

              {session.current ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)]"
                  >
                    {t('app.profile.revoke')}
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
              {t('app.profile.signOutOthers')}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  )
}
