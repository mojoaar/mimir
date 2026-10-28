import Script from 'next/script'
import { getAnalytics } from '@/lib/settings/analytics'

/** Umami watches the History API, so one tag covers every route change. */
export async function Analytics() {
  const { enabled, scriptUrl, websiteId } = await getAnalytics()
  if (!enabled) return null
  return (
    <Script
      src={scriptUrl}
      strategy="afterInteractive"
      data-website-id={websiteId}
      data-do-not-track="true"
    />
  )
}
