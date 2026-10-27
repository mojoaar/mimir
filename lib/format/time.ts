import type { Clock } from '../settings/time'

export type StampOptions = {
  clock?: Clock
  seconds?: boolean
  dateOnly?: boolean
}

type Parts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

/**
 * Everything Mimir prints runs through here: dates are ISO (`YYYY-MM-DD`),
 * times are 24-hour unless the install asked for 12-hour, and a bad zone falls
 * back to UTC instead of throwing on a page render.
 */
export function stamp(date: Date, timeZone: string, options: StampOptions = {}): string {
  const parts = partsOf(date, timeZone)
  const day = `${parts.year}-${parts.month}-${parts.day}`
  if (options.dateOnly) return day
  return `${day} ${clockTime(parts, options)} ${zoneName(date, timeZone)}`
}

export function dayKey(date: Date, timeZone: string): string {
  const parts = partsOf(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** A usage bucket key. Always 24-hour: it identifies an hour, it does not describe one. */
export function hourKey(date: Date, timeZone: string): string {
  return `${dayKey(date, timeZone)}T${partsOf(date, timeZone).hour}`
}

/** Turns a `YYYY-MM-DDTHH` bucket key into a label without re-shifting it through a Date. */
export function hourStamp(key: string, clock: Clock = '24h'): string {
  const [day, hour] = key.split('T')
  const numeric = Number(hour)
  const time =
    clock === '12h'
      ? `${numeric % 12 === 0 ? 12 : numeric % 12}:00 ${numeric < 12 ? 'AM' : 'PM'}`
      : `${String(numeric).padStart(2, '0')}:00`
  return `${day} ${time}`
}

export function zoneName(date: Date, timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((piece) => piece.type === 'timeZoneName')
    return part?.value ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

function clockTime(parts: Parts, options: StampOptions): string {
  const seconds = options.seconds ? `:${parts.second}` : ''
  if (options.clock !== '12h') return `${parts.hour}:${parts.minute}${seconds}`
  const hour = Number(parts.hour)
  const shown = hour % 12 === 0 ? 12 : hour % 12
  return `${shown}:${parts.minute}${seconds} ${hour < 12 ? 'AM' : 'PM'}`
}

function partsOf(date: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const found: Record<string, string> = {}
  for (const piece of formatter.formatToParts(date)) found[piece.type] = piece.value
  return {
    year: found.year ?? '1970',
    month: found.month ?? '01',
    day: found.day ?? '01',
    hour: (found.hour ?? '00').padStart(2, '0'),
    minute: found.minute ?? '00',
    second: found.second ?? '00',
  }
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}
