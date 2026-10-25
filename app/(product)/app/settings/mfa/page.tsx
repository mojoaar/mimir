import { requireUser } from '@/lib/auth/context'
import { mfaEnabled } from '@/lib/auth/mfa'
import { translator } from '@/lib/i18n/request'
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
  const t = await translator()
  const { notice, error } = await searchParams
  const on = await mfaEnabled(user.id)
  const required = await getRequireMfa()

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('app.mfa.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('app.mfa.body')}</p>
      </div>

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

      {on ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm">{t('app.mfa.on')}</p>
          {required ? (
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
        <Enrolment userId={user.id} />
      )}
    </section>
  )
}
