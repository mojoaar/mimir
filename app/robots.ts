import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

import { canonicalFor } from '@/lib/seo'

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Throws when called outside a request (unit tests); the call exists to keep the route dynamic.
  try {
    await connection()
  } catch {}
  const origin = await canonicalFor('/')
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/api', '/mcp', '/login', '/set-password'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
