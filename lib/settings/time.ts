import { cache } from 'react'

import { InvalidSetting, readSetting, writeSetting } from './store'

export const TIMEZONE_KEY = 'timezone'
export const CLOCK_KEY = 'clock'

export type Clock = '24h' | '12h'

const DEFAULT_CLOCK: Clock = '24h'

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function isClock(value: unknown): value is Clock {
  return value === '24h' || value === '12h'
}

/**
 * The zone an install starts with: whatever TZ says, so a container that already
 * has one keeps it. Once the owner picks a zone, that wins.
 */
export function defaultTimezone(env: { TZ?: string | undefined } = process.env as { TZ?: string }): string {
  const tz = env.TZ
  return tz && isTimezone(tz) ? tz : 'UTC'
}

export const getTimezone = cache(async (): Promise<string> => {
  const stored = await readSetting<string>(TIMEZONE_KEY)
  return stored && isTimezone(stored) ? stored : defaultTimezone()
})

export const getClock = cache(async (): Promise<Clock> => {
  const stored = await readSetting<Clock>(CLOCK_KEY)
  return isClock(stored) ? stored : DEFAULT_CLOCK
})

export const getTimeFormat = cache(async (): Promise<{ timeZone: string; clock: Clock }> => ({
  timeZone: await getTimezone(),
  clock: await getClock(),
}))

export async function setTimezone(value: string, updatedBy: string): Promise<void> {
  const zone = value.trim() || defaultTimezone()
  if (!isTimezone(zone)) throw new InvalidSetting(`${zone} is not a timezone`)
  // Follow the default rather than pinning it, so changing TZ still moves an install that never chose.
  await writeSetting(TIMEZONE_KEY, zone === defaultTimezone() ? null : zone, updatedBy)
}

export async function setClock(value: string, updatedBy: string): Promise<void> {
  if (!isClock(value)) throw new InvalidSetting('the clock is either 24h or 12h')
  await writeSetting(CLOCK_KEY, value === DEFAULT_CLOCK ? null : value, updatedBy)
}

export function timezoneOptions(): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
  return [...new Set(['UTC', ...zones])].sort()
}
