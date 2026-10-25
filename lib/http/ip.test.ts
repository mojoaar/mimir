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

  it('skips trusted hops and takes the first untrusted one, right to left', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7, 10.0.0.5' }), ['10.0.0.0/8'], '10.0.0.5'))
      .toBe('198.51.100.7')
  })

  it('takes the hop the proxy appended when the peer is not exposed', () => {
    // nginx appends with $proxy_add_x_forwarded_for, so the caller-supplied
    // first entry is attacker-chosen and the last one is the real client.
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }), ['10.0.0.0/8'], null))
      .toBe('203.0.113.9')
  })

  it('falls back to the peer when the header is absent', () => {
    expect(clientIp(h({}), ['10.0.0.0/8'], '10.0.0.5')).toBe('10.0.0.5')
  })
})
