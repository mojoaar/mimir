import { cookies } from 'next/headers'

import { requireUser } from '@/lib/auth/context'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { sessionIdFor } from '@/lib/auth/session'
import { stamp } from '@/lib/format/time'
import { translator } from '@/lib/i18n/request'
import { getTimeFormat } from '@/lib/settings/time'
import { listMySessions } from '@/lib/users/self'
import { avatarVersion } from '@/lib/users/avatar'
import { getRequestLocale } from '@/lib/i18n/request'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from '@/app/theme-switcher'
import { LanguageSwitcher } from '@/app/language-switcher'
import { getConfig } from '@/lib/config'
import { listApiKeys } from '@/lib/auth/apikey'
import { mfaEnabled } from '@/lib/auth/mfa'
import { getRequireMfa } from '@/lib/settings/security'
import { setLocaleAction } from '../../actions'
import { KeyForm, KeyList } from '../key-form'
import { Enrolment } from '../mfa/enrolment'
import { disableMfaAction } from '../mfa/actions'
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
  const { timeZone, clock } = await getTimeFormat()
  const { notice, error } = await searchParams
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  const currentSessionId = (await sessionIdFor(cookieValue)) ?? ''
  const sessions = await listMySessions(user.id, currentSessionId)
  const [keys, mfaOn, mfaRequired, locale] = await Promise.all([
    listApiKeys(user.id),
    mfaEnabled(user.id),
    getRequireMfa(),
    getRequestLocale(),
  ])
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  const base = getConfig().publicUrlSeed?.replace(/\/$/, '') ?? 'http://localhost:3000'

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
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
      {notice === 'off' ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          {t('app.mfa.offNotice')}
        </p>
      ) : null}
      {error === 'required' ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          {t('app.mfa.requiredOff')}
        </p>
      ) : null}
      {error && error !== 'required' ? (
        <p className="rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.profile.avatar')}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/app/avatar?v=${await avatarVersion(user.id)}`}
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
        <h2 className="text-lg font-medium">{t('app.mfa.title')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.mfa.body')}</p>
        {mfaOn ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
            <p className="text-sm">{t('app.mfa.on')}</p>
            {mfaRequired ? (
              <p className="text-sm text-[var(--text-muted)]">{t('app.mfa.requiredOn')}</p>
            ) : (
              <form action={disableMfaAction}>
                <button
                  type="submit"
                  className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]"
                >
                  {t('app.mfa.turnOff')}
                </button>
              </form>
            )}
          </div>
        ) : (
          // Collapsed: the enrolment component mints a pending secret and draws
          // the QR on every render, which nobody wants on a profile page they
          // opened to change an avatar.
          <details className="rounded-lg border border-[var(--border)] p-4">
            <summary className="cursor-pointer text-sm font-medium">{t('app.mfa.turnOn')}</summary>
            <div className="mt-3">
              <Enrolment userId={user.id} />
            </div>
          </details>
        )}
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
                    when: stamp(session.lastSeenAt, timeZone, { clock }),
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

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.settings.appearanceTitle')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.settings.appearanceBody')}</p>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <LanguageSwitcher
            value={locale}
            label={t('app.language.label')}
            action={setLocaleAction}
          />
          <ThemeSwitcher value={theme} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('app.settings.keysTitle')}</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {t('app.settings.keysBody', { mcp: `${base}/mcp`, api: `${base}/api/v1` })}
        </p>
        <KeyForm
          labels={{
            name: t('app.settings.keyName'),
            placeholder: t('app.settings.keyNamePlaceholder'),
            create: t('app.settings.keyCreate'),
            creating: t('app.settings.keyCreating'),
            copyNow: t('app.settings.keyCopyNow'),
          }}
        />
        <KeyList
          keys={keys.map((key) => ({
            ...key,
            lastUsedAt: key.lastUsedAt ? stamp(key.lastUsedAt, timeZone, { dateOnly: true }) : null,
          }))}
          labels={{
            empty: t('app.settings.keyEmpty'),
            revoked: t('app.settings.keyRevoked'),
            neverUsed: t('app.settings.keyNeverUsed'),
            lastUsed: t('app.settings.keyLastUsed'),
            revoke: t('app.settings.keyRevoke'),
          }}
        />
      </div>
    </section>
  )
}
