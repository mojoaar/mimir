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
  // The install names itself, the way the landing page does: the page says what
  // it is, the site setting says whose it is. The description falls back to the
  // site one so a short page still has something to say in a search result.
  const title = `${input.title} | ${settings.siteName}`
  const description = input.description.trim() || settings.metaDescription
  const languages = Object.fromEntries(
    Object.entries(localeAlternates(input.path)).map(([locale, path]) => [
      locale,
      `${origin}${path === '/' ? '' : path}`,
    ]),
  )

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: input.locales ? { canonical, languages } : { canonical },
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title,
      description,
      url: canonical,
      images: [{ url: `${origin}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}
