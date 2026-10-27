import Link from 'next/link'

import { cookies } from 'next/headers'

import { getRequestLocale, translator } from '@/lib/i18n/request'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { ThemeSwitcher } from '@/app/theme-switcher'
import { LanguageSwitcher } from '@/app/language-switcher'
import { setLocaleAction } from '../actions'
import { requireUser } from '@/lib/auth/context'
import { listApiKeys } from '@/lib/auth/apikey'
import { getConfig } from '@/lib/config'
import { stamp } from '@/lib/format/time'
import { getTimeFormat } from '@/lib/settings/time'
import { KeyForm, KeyList } from './key-form'

export const instant = false

export default async function SettingsPage() {
  const user = await requireUser()
  const t = await translator()
  const { timeZone } = await getTimeFormat()
  const keys = await listApiKeys(user.id)
  const locale = await getRequestLocale()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  const base = getConfig().publicUrlSeed?.replace(/\/$/, '') ?? 'http://localhost:3000'

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.settings.profileTitle')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.settings.profileBody')}</p>
        <p className="text-sm">
          <Link href="/app/settings/profile" className="underline">
            {t('app.settings.profileLink')}
          </Link>
        </p>
      </section>

      <section className="space-y-3">
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
      </section>

      <section className="space-y-3">
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
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.settings.yourKeys')}</h2>
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
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.settings.providersTitle')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.settings.providersBody')}</p>
        <p className="text-sm">
          <Link href="/app/settings/providers" className="underline">
            {t('app.settings.providersLink')}
          </Link>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.settings.mfaTitle')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.settings.mfaBody')}</p>
        <p className="text-sm">
          <Link href="/app/settings/mfa" className="underline">
            {t('app.settings.mfaLink')}
          </Link>
        </p>
      </section>
    </main>
  )
}
