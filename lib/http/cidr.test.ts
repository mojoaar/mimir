import { describe, expect, test } from 'vitest'
import { isCidr, matchesAnyCidr, matchesCidr } from './cidr'

describe('isCidr', () => {
  test.each(['10.0.0.0/8', '192.168.1.0/24', '0.0.0.0/0', '::1/128', '2001:db8::/32'])(
    'accepts %s',
    (value) => {
      expect(isCidr(value)).toBe(true)
    },
  )

  test.each(['10.0.0.0', '999.0.0.0/8', '10.0.0.0/33', '10.0.0.0/-1', '', '10.0.0.0/8, 10.1.0.0/16'])(
    'rejects %s',
    (value) => {
      expect(isCidr(value)).toBe(false)
    },
  )
})

describe('matchesCidr', () => {
  test('matches an address inside the block', () => {
    expect(matchesCidr('10.4.4.4', '10.0.0.0/8')).toBe(true)
  })

  test('rejects an address outside the block', () => {
    expect(matchesCidr('203.0.113.9', '10.0.0.0/8')).toBe(false)
  })

  test('matches IPv6', () => {
    expect(matchesCidr('::1', '::1/128')).toBe(true)
  })

  test('matches everything under 0.0.0.0/0', () => {
    expect(matchesCidr('203.0.113.9', '0.0.0.0/0')).toBe(true)
  })

  test('never matches a malformed address', () => {
    expect(matchesCidr('not-an-ip', '10.0.0.0/8')).toBe(false)
  })
})

describe('matchesAnyCidr', () => {
  test('an empty list allows everything', () => {
    expect(matchesAnyCidr('203.0.113.9', [])).toBe(true)
    expect(matchesAnyCidr(null, [])).toBe(true)
  })

  test('a non-empty list denies an unknown address', () => {
    expect(matchesAnyCidr(null, ['10.0.0.0/8'])).toBe(false)
  })

  test('matches when any entry matches', () => {
    expect(matchesAnyCidr('10.4.4.4', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(true)
    expect(matchesAnyCidr('203.0.113.9', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(false)
  })
})
