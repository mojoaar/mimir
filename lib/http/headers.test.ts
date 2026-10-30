import { expect, it } from 'vitest'
import { securityHeaders } from './headers'

it('forbids framing and says where referrers may go', () => {
  const headers = Object.fromEntries(securityHeaders().map((h) => [h.key.toLowerCase(), h.value]))
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-content-type-options']).toBe('nosniff')
})
