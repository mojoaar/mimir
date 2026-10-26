import type { MetadataRoute } from 'next'

/** Installed like an app: the mark, the ink, and straight into the memory browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mimir',
    short_name: 'Mimir',
    description: 'Long-term memory for coding agents.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0f1419',
    theme_color: '#0f1419',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
