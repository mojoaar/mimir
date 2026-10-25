import { requireAdmin } from '@/lib/auth/admin'
import { getConfig } from '@/lib/config'
import { getSiteSettings } from '@/lib/settings/site'
import { getIpAllowlist, getRequireMfa } from '@/lib/settings/security'
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
  const params = await searchParams
  const [site, requireMfa, allowlist] = await Promise.all([
    getSiteSettings(),
    getRequireMfa(),
    getIpAllowlist(),
  ])
  const proxyWarning = allowlist.length > 0 && getConfig().trustedProxies.length === 0

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Site settings</h1>

      {params.notice ? <p className="text-sm text-[var(--accent)]">{params.notice}</p> : null}
      {params.error ? <p className="text-sm text-[var(--danger)]">{params.error}</p> : null}

      <form action={saveSiteSettingsAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Public URL</span>
          <input name="publicUrl" defaultValue={site.publicUrl} className={FIELD} style={FIELD_STYLE} />
          <span className="text-xs text-[var(--text-muted)]">
            Used in canonical links, the sitemap and every emailed link. Moving it signs everyone out.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Site name</span>
          <input name="siteName" defaultValue={site.siteName} className={FIELD} style={FIELD_STYLE} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Meta description</span>
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
          Require two-factor for every user (the bootstrap admin stays exempt)
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">IP allowlist (one CIDR per line, empty allows everyone)</span>
          <textarea
            name="ipAllowlist"
            defaultValue={allowlist.join('\n')}
            rows={4}
            placeholder="203.0.113.0/24"
            className={FIELD}
            style={FIELD_STYLE}
          />
          <span className="text-xs text-[var(--text-muted)]">
            {proxyWarning
              ? 'MIMIR_TRUSTED_PROXIES is empty, so no client address can be read: a non-empty list will deny every request.'
              : 'The client address is read from X-Forwarded-For, trusted only from MIMIR_TRUSTED_PROXIES.'}
          </span>
        </label>

        <div>
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            Save
          </button>
        </div>
      </form>
    </main>
  )
}
