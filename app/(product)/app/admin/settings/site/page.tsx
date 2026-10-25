import { requireAdmin } from '@/lib/auth/admin'
import { getConfig } from '@/lib/config'
import { translator } from '@/lib/i18n/request'
import { getSiteSettings } from '@/lib/settings/site'
import { getIpAllowlist, getRequireMfa } from '@/lib/settings/security'
import { getEmailSettings } from '@/lib/settings/email-settings'
import { saveSiteSettingsAction } from './actions'

export const instant = false

const FIELD = 'w-full rounded border px-3 py-2 text-sm'
const FIELD_STYLE = {
  borderColor: 'var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
}

export default async function SiteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const t = await translator()
  const params = await searchParams
  const [site, requireMfa, allowlist, email] = await Promise.all([
    getSiteSettings(),
    getRequireMfa(),
    getIpAllowlist(),
    getEmailSettings(),
  ])
  const proxyWarning = allowlist.length > 0 && getConfig().trustedProxies.length === 0

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">{t('app.admin.site.title')}</h1>

      {params.notice ? <p className="text-sm text-[var(--accent)]">{params.notice}</p> : null}
      {params.error ? <p className="text-sm text-[var(--danger)]">{params.error}</p> : null}

      <form action={saveSiteSettingsAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.admin.site.publicUrl')}</span>
          <input name="publicUrl" defaultValue={site.publicUrl} className={FIELD} style={FIELD_STYLE} />
          <span className="text-xs text-[var(--text-muted)]">
            {t('app.admin.site.publicUrlHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.admin.site.siteName')}</span>
          <input name="siteName" defaultValue={site.siteName} className={FIELD} style={FIELD_STYLE} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.admin.site.metaDescription')}</span>
          <textarea
            name="metaDescription"
            defaultValue={site.metaDescription}
            rows={2}
            className={FIELD}
            style={FIELD_STYLE}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requireMfa" defaultChecked={requireMfa} />
          {t('app.admin.site.requireMfa')}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">{t('app.admin.site.allowlist')}</span>
          <textarea
            name="ipAllowlist"
            defaultValue={allowlist.join('\n')}
            rows={4}
            placeholder="203.0.113.0/24"
            className={FIELD}
            style={FIELD_STYLE}
          />
          <span className="text-xs text-[var(--text-muted)]">
            {t(proxyWarning ? 'app.admin.site.proxyWarning' : 'app.admin.site.proxyNote')}
          </span>
        </label>

        <fieldset className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <legend className="text-sm font-medium">{t('app.admin.site.email')}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="emailEnabled" defaultChecked={email !== null} />
            {t('app.admin.site.emailEnable')}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('app.admin.site.emailFrom')}</span>
            <input name="emailFrom" defaultValue={email?.from ?? ''} placeholder="Mimir <mimir.com>" className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">
              {t(email ? 'app.admin.site.emailKeyKeep' : 'app.admin.site.emailKey')}
            </span>
            <input name="emailKey" type="password" autoComplete="off" className={FIELD} style={FIELD_STYLE} />
          </label>
        </fieldset>

        <div>
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {t('app.admin.site.save')}
          </button>
        </div>
      </form>
    </main>
  )
}
