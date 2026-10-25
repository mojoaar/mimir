import { afterEach, describe, expect, it, vi } from 'vitest'
import { toResponse } from './errors'

describe('an unexpected error', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the message without the connection string', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = toResponse(new Error('connect ECONNREFUSED postgres://mimir_app:pw@db:5432'))

    expect(response.status).toBe(500)
    const text = logged.mock.calls[0]?.[0]
    expect(text).toContain('ECONNREFUSED')
    expect(text).not.toContain('pw@')
    expect(logged.mock.calls[0]).toHaveLength(1)
  })
})
