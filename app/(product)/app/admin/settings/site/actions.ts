'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import { audit } from '@/lib/audit'
import { getSiteSettings, setSiteSettings } from '@/lib/settings/site'
import { getIpAllowlist, getRequireMfa, setIpAllowlist, setRequireMfa } from '@/lib/settings/security'
import { invalidateAllowlistCache } from '@/lib/http/allowlist'

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function saveSiteSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin()

  try {
    const allowlist = text(formData, 'ipAllowlist')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    await setSiteSettings(
      {
        publicUrl: text(formData, 'publicUrl'),
        siteName: text(formData, 'siteName') || 'Mimir',
        metaDescription: text(formData, 'metaDescription'),
      },
      user.id,
    )
    await setRequireMfa(text(formData, 'requireMfa') === 'on', user.id)
    await setIpAllowlist(allowlist, user.id)
    invalidateAllowlistCache()

    const before = await getSiteSettings()
    const mfa = await getRequireMfa()
    const list = await getIpAllowlist()
    await audit({
      actorType: 'user',
      actorId: user.id,
      action: 'admin.site_settings',
      targetType: 'setting',
      targetId: 'site',
      detail: {
        publicUrl: before.publicUrl,
        requireMfa: mfa,
        allowlistEntries: list.length,
      },
    })
  } catch (thrown) {
    const message = (thrown instanceof Error ? thrown : new Error(String(thrown))).message
    redirect(`/app/admin/settings/site?error=${encodeURIComponent(message)}`)
  }

  redirect('/app/admin/settings/site?notice=Saved.')
}
