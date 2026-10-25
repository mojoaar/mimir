'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import { audit } from '@/lib/audit'
import { getSiteSettings, setSiteSettings } from '@/lib/settings/site'
import { getIpAllowlist, getRequireMfa, setIpAllowlist, setRequireMfa } from '@/lib/settings/security'
import { getEmailSettings, setEmailSettings } from '@/lib/settings/email-settings'
import { invalidateAllowlistCache } from '@/lib/http/allowlist'
import { InvalidSetting } from '@/lib/settings/store'
import { translator } from '@/lib/i18n/request'
import { actionMessage } from '@/lib/i18n/errors'

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function saveSiteSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin()
  const t = await translator()

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

    const emailEnabled = text(formData, 'emailEnabled') === 'on'
    const emailFrom = text(formData, 'emailFrom')
    const emailKey = text(formData, 'emailKey')
    const stored = await getEmailSettings()
    if (emailEnabled && emailFrom) {
      const apiKey = emailKey || stored?.apiKey || ''
      if (!apiKey) {
        throw new InvalidSetting('an API key is required to send email through Resend')
      }
      await setEmailSettings({ enabled: true, from: emailFrom, apiKey }, user.id)
    } else {
      await setEmailSettings(null, user.id)
    }

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
    // Never hand a driver message to a page: it can carry SQL and column names.
    redirect(`/app/admin/settings/site?error=${encodeURIComponent(actionMessage(thrown, t))}`)
  }

  redirect(`/app/admin/settings/site?notice=${encodeURIComponent(t('app.admin.site.saved'))}`)
}
