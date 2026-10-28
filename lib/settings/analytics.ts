import { cache } from 'react'
import { InvalidSetting, readSetting, writeSetting } from './store'

export const ANALYTICS_KEY = 'analytics'

export type Analytics = { enabled: boolean; scriptUrl: string; websiteId: string }

const OFF: Analytics = { enabled: false, scriptUrl: '', websiteId: '' }

export function isScriptUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Cached per request so the layout and a page share one read. Anything
 * unusable reads as off: analytics that cannot be pointed at a script must not
 * be half-on.
 */
export const getAnalytics = cache(async (): Promise<Analytics> => {
  const stored = await readSetting<Partial<Analytics>>(ANALYTICS_KEY)
  if (!stored || typeof stored.enabled !== 'boolean') return OFF
  const scriptUrl = typeof stored.scriptUrl === 'string' ? stored.scriptUrl.trim() : ''
  const websiteId = typeof stored.websiteId === 'string' ? stored.websiteId.trim() : ''
  if (stored.enabled && (!isScriptUrl(scriptUrl) || websiteId === '')) return OFF
  return { enabled: stored.enabled, scriptUrl, websiteId }
})

export async function setAnalytics(next: Analytics, updatedBy: string): Promise<void> {
  const enabled = next.enabled === true
  const scriptUrl = next.scriptUrl.trim()
  const websiteId = next.websiteId.trim()
  if (enabled && !isScriptUrl(scriptUrl)) {
    throw new InvalidSetting('the analytics script URL must be an absolute http or https URL')
  }
  if (enabled && websiteId === '') throw new InvalidSetting('the analytics website ID is required')
  await writeSetting(ANALYTICS_KEY, { enabled, scriptUrl, websiteId }, updatedBy)
}
