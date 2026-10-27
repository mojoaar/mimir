import { describe, expect, test } from 'vitest'

import { defaultTimezone, isClock, isTimezone, timezoneOptions } from './time'

describe('the time settings', () => {
  test('accepts a real zone and refuses nonsense', () => {
    expect(isTimezone('Europe/Copenhagen')).toBe(true)
    expect(isTimezone('UTC')).toBe(true)
    expect(isTimezone('Mars/Olympus_Mons')).toBe(false)
    expect(isTimezone('')).toBe(false)
  })

  test('knows the only two clock styles', () => {
    expect(isClock('24h')).toBe(true)
    expect(isClock('12h')).toBe(true)
    expect(isClock('13h')).toBe(false)
    expect(isClock(null)).toBe(false)
  })

  test('starts from TZ, and falls back to UTC when TZ is missing or wrong', () => {
    expect(defaultTimezone({ TZ: 'Europe/Copenhagen' })).toBe('Europe/Copenhagen')
    expect(defaultTimezone({})).toBe('UTC')
    expect(defaultTimezone({ TZ: 'Not/AZone' })).toBe('UTC')
  })

  test('offers a sorted list that includes UTC', () => {
    const zones = timezoneOptions()
    expect(zones).toContain('UTC')
    expect(zones).toContain('Europe/Copenhagen')
    expect(zones).toEqual([...zones].sort())
  })
})
