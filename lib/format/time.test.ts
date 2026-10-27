import { describe, expect, test } from 'vitest'

import { dayKey, hourKey, hourStamp, stamp, zoneName } from './time'

const monitor = new Date('2026-10-27T05:21:07Z')

describe('the formatter', () => {
  test('prints a Copenhagen time with its zone', () => {
    expect(stamp(monitor, 'Europe/Copenhagen', { seconds: true })).toBe('2026-10-27 06:21:07 CET')
  })

  test('prints UTC when the install is on UTC', () => {
    expect(stamp(monitor, 'UTC')).toBe('2026-10-27 05:21 UTC')
  })

  test('follows daylight saving in summer', () => {
    expect(stamp(new Date('2026-07-15T12:00:00Z'), 'Europe/Copenhagen')).toBe('2026-07-15 14:00 CEST')
  })

  test('buckets by the local day, not the UTC one', () => {
    const late = new Date('2026-10-26T23:30:00Z')
    expect(dayKey(late, 'UTC')).toBe('2026-10-26')
    expect(dayKey(late, 'Pacific/Auckland')).toBe('2026-10-27')
    expect(hourKey(late, 'Pacific/Auckland')).toBe('2026-10-27T12')
  })

  test('falls back to UTC for a zone that does not exist', () => {
    expect(stamp(monitor, 'Mars/Olympus_Mons')).toBe('2026-10-27 05:21 UTC')
    expect(zoneName(monitor, 'Mars/Olympus_Mons')).toBe('UTC')
  })

  test('reads the time on a 12-hour clock when asked', () => {
    expect(stamp(new Date('2026-10-27T14:05:00Z'), 'Europe/Copenhagen', { clock: '12h' })).toBe(
      '2026-10-27 3:05 PM CET',
    )
    expect(stamp(new Date('2026-10-27T01:05:00Z'), 'Europe/Copenhagen', { clock: '12h' })).toBe(
      '2026-10-27 2:05 AM CET',
    )
  })

  test('says 12 at midnight and noon, not 0', () => {
    expect(stamp(new Date('2026-10-26T23:00:00Z'), 'UTC', { clock: '12h' })).toBe('2026-10-26 11:00 PM UTC')
    expect(stamp(new Date('2026-10-27T00:00:00Z'), 'UTC', { clock: '12h' })).toBe('2026-10-27 12:00 AM UTC')
    expect(stamp(new Date('2026-10-27T12:00:00Z'), 'UTC', { clock: '12h' })).toBe('2026-10-27 12:00 PM UTC')
  })

  test('never prints a locale date or a lowercase meridiem', () => {
    const text = stamp(new Date('2026-10-27T15:05:00Z'), 'Europe/Copenhagen', { clock: '12h' })
    expect(text).toMatch(/^2026-10-27 4:05 PM /)
    expect(text).not.toMatch(/\b(am|pm)\b/)
    expect(dayKey(monitor, 'Europe/Copenhagen')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(stamp(monitor, 'Europe/Copenhagen', { dateOnly: true })).toBe('2026-10-27')
  })

  test('labels a bucket key in either clock style without moving it', () => {
    expect(hourStamp('2026-10-27T06')).toBe('2026-10-27 06:00')
    expect(hourStamp('2026-10-27T06', '12h')).toBe('2026-10-27 6:00 AM')
    expect(hourStamp('2026-10-27T00', '12h')).toBe('2026-10-27 12:00 AM')
    expect(hourStamp('2026-10-27T12', '12h')).toBe('2026-10-27 12:00 PM')
  })
})
