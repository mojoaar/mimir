import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

import { DOCS_SLUGS } from '@/lib/docs/nav'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n'
import { canonicalFor } from '@/lib/seo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Throws when called outside a request (unit tests); the call exists to keep the route dynamic.
  try {
    await connection()
  } catch {}
  const origin = await canonicalFor('/')
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, `${origin}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}`]),
  )
  const marketing = LOCALES.map((locale) => ({
    url: `${origin}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: locale === DEFAULT_LOCALE ? 1 : 0.8,
    alternates: { languages },
  }))

  // Docs are English only, so they carry no locale alternates.
  const docs = DOCS_SLUGS.map((slug) => ({
    url: `${origin}${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: slug === '/docs' ? 0.7 : 0.5,
  }))

  return [...marketing, ...docs]
}
