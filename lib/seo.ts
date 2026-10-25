import type { Metadata } from 'next'

import { localeAlternates } from './i18n'
import { getPublicUrl, getSiteSettings } from './settings/site'

export const PRIVATE_ROBOTS = { index: false, follow: false } as const

/** Absolute URL for a public path, always built from the configured public URL. */
export async function canonicalFor(path: string): Promise<string> {
  const base = (await getPublicUrl()).replace(/\/+$/, '')
  if (path === '/' || path === '') return base
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export async function publicMetadata(input: {
  title: string
  description: string
  path: string
  /** Set on pages that really exist in every locale (marketing); docs are English only. */
  locales?: boolean
}): Promise<Metadata> {
  const [origin, settings] = await Promise.all([canonicalFor('/'), getSiteSettings()])
  const canonical = await canonicalFor(input.path)
  const languages = Object.fromEntries(
    Object.entries(localeAlternates(input.path)).map(([locale, path]) => [
      locale,
      `${origin}${path === '/' ? '' : path}`,
    ]),
  )

  return {
    metadataBase: new URL(origin),
    title: input.title,
    description: input.description,
    alternates: input.locales ? { canonical, languages } : { canonical },
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title: input.title,
      description: input.description,
      url: canonical,
      images: [{ url: `${origin}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: input.title, description: input.description },
  }
}
