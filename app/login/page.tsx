import { headers } from 'next/headers'
import Link from 'next/link'
import { cancelMfaAction, loginAction, loginMfaAction } from './actions'
import { isRequestAllowed } from '@/lib/http/allowlist'
import { PRIVATE_ROBOTS } from '@/lib/seo'
import { translator } from '@/lib/i18n/request'

// The error arrives as a reason code so the URL stays language-neutral.
const REASONS = [
  'invalid',
  'pending',
  'disabled',
  'locked',
  'expired',
  'invalid_code',
  'replayed',
  'not_enrolled',
]

export const instant = false

const FIELD =
  'rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 font-normal text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export const metadata = { title: 'Sign in - Mimir', robots: PRIVATE_ROBOTS };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string }>
}) {
  const { error, step } = await searchParams
  const t = await translator()
  const message = error
    ? t(`app.login.error.${REASONS.includes(error) ? error : 'failed'}`)
    : null

  if (!(await isRequestAllowed({ headers: await headers() }))) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('app.layout.blocked')}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('app.layout.blockedBody')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 'code' ? t('app.login.titleCode') : t('app.login.title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {step === 'code' ? t('app.login.subtitleCode') : t('app.login.subtitle')}
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
              {t('app.login.code')}
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
              {t('app.login.continue')}
            </button>
          </form>
          <form action={cancelMfaAction}>
            <button type="submit" className="text-sm text-[var(--text-muted)] underline">
              {t('app.login.startOver')}
            </button>
          </form>
        </>
      ) : (
        <form action={loginAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('app.login.email')}
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
            {t('app.login.password')}
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
            {t('app.login.submit')}
          </button>
          <Link href="/forgot-password" className="text-sm text-[var(--text-muted)] underline">
            {t('app.login.forgot')}
          </Link>
        </form>
      )}
    </main>
  )
}
