import { requireAdmin } from '@/lib/auth/admin'
import { getConfig } from '@/lib/config'
import { translator } from '@/lib/i18n/request'
import { getSiteSettings } from '@/lib/settings/site'
import { getIpAllowlist, getRequireMfa } from '@/lib/settings/security'
import { getEmailSettings } from '@/lib/settings/email-settings'
import { getTimeFormat, timezoneOptions } from '@/lib/settings/time'
import { getLearningDefault } from '@/lib/settings/learning'
import { getAnalytics } from '@/lib/settings/analytics'
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
  const [site, requireMfa, allowlist, email, { timeZone, clock }, learningDefault, analytics] =
    await Promise.all([
      getSiteSettings(),
      getRequireMfa(),
      getIpAllowlist(),
      getEmailSettings(),
      getTimeFormat(),
      getLearningDefault(),
      getAnalytics(),
    ])
  const zones = timezoneOptions()
  if (!zones.includes(timeZone)) zones.unshift(timeZone)
  const proxyWarning = allowlist.length > 0 && getConfig().trustedProxies.length === 0

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">{t('app.admin.site.title')}</h1>

      {params.notice ? <p className="text-sm text-[var(--accent)]">{params.notice}</p> : null}
      {params.error ? <p className="text-sm text-[var(--danger)]">{params.error}</p> : null}

      <form action={saveSiteSettingsAction} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>

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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('app.admin.site.timezone')}</span>
            <select name="timezone" defaultValue={timeZone} className={FIELD} style={FIELD_STYLE}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--text-muted)]">{t('app.admin.site.timezoneHint')}</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('app.admin.site.clock')}</span>
            <select name="clock" defaultValue={clock} className={FIELD} style={FIELD_STYLE}>
              <option value="24h">{t('app.admin.site.clock24')}</option>
              <option value="12h">{t('app.admin.site.clock12')}</option>
            </select>
            <span className="text-xs text-[var(--text-muted)]">{t('app.admin.site.clockHint')}</span>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <input type="checkbox" name="learningDefault" defaultChecked={learningDefault} />
            {t('app.admin.site.learningDefault')}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {t('app.admin.site.learningDefaultHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <input type="checkbox" name="analyticsEnabled" defaultChecked={analytics.enabled} />
            {t('app.admin.site.analyticsEnabled')}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{t('app.admin.site.analyticsHint')}</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('app.admin.site.analyticsScriptUrl')}</span>
            <input
              name="analyticsScriptUrl"
              defaultValue={analytics.scriptUrl}
              placeholder="https://umami.example.com/script.js"
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('app.admin.site.analyticsWebsiteId')}</span>
            <input
              name="analyticsWebsiteId"
              defaultValue={analytics.websiteId}
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>
        </div>

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
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
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
