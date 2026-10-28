import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  value: { enabled: false, scriptUrl: '', websiteId: '' },
}))

vi.mock('@/lib/settings/analytics', () => ({
  getAnalytics: async () => state.value,
}))

import { Analytics } from './analytics'

beforeEach(() => {
  state.value = { enabled: false, scriptUrl: '', websiteId: '' }
})

// `next/script` renders nothing outside the Next runtime, so the assertion is on
// what the element is told to load rather than on markup.
function props(element: Awaited<ReturnType<typeof Analytics>>) {
  if (!element) throw new Error('expected a script element')
  return (element as ReactElement<Record<string, unknown>>).props
}

describe('the tracker', () => {
  it('is one tag when it is configured', async () => {
    state.value = { enabled: true, scriptUrl: 'https://stats.example.com/script.js', websiteId: 'abc-123' }

    const element = props(await Analytics())

    expect(element.src).toBe('https://stats.example.com/script.js')
    expect(element['data-website-id']).toBe('abc-123')
    expect(element['data-do-not-track']).toBe('true')
    expect(element.strategy).toBe('afterInteractive')
  })

  it('is nothing when it is off', async () => {
    expect(await Analytics()).toBeNull()
  })

  it('is nothing when the row says on but cannot be used', async () => {
    state.value = { enabled: false, scriptUrl: '', websiteId: '' }

    expect(await Analytics()).toBeNull()
  })
})
