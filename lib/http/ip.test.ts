import { describe, expect, it } from 'vitest'
import { clientIp } from './ip'

const h = (entries: Record<string, string>) => new Headers(entries)

describe('clientIp', () => {
  it('ignores a forwarded header from an untrusted peer', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4' }), ['10.0.0.0/8'], '203.0.113.9'))
      .toBe('203.0.113.9')
  })

  it('honours a forwarded header from a trusted peer', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.5' }), ['10.0.0.0/8'], '10.0.0.5'))
      .toBe('1.2.3.4')
  })

  it('falls back to the peer when the header is absent', () => {
    expect(clientIp(h({}), ['10.0.0.0/8'], '10.0.0.5')).toBe('10.0.0.5')
  })
})
