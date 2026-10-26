import { expect, test } from 'vitest'
import manifest from './manifest'

test('installs as an app that opens the memory browser', () => {
  const value = manifest()

  expect(value.start_url).toBe('/app')
  expect(value.icons).toEqual([
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ])
})
