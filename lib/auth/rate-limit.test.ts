import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLoginRateLimit,
  loginRateLimitSize,
  checkResetRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimit,
  resetResetRateLimit,
} from './rate-limit'

const alice = 'Alice@Example.test'

beforeEach(() => {
  resetLoginRateLimit()
  resetResetRateLimit()
})

describe('the login throttle', () => {
  it('blocks the sixth attempt for one account', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(alice)

    const result = checkLoginRateLimit(alice)

    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('leaves another account alone', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(alice)

    expect(checkLoginRateLimit('bob@example.test').allowed).toBe(true)
  })

  it('counts an address in any case as the same account', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(' ALICE@example.test ')

    expect(checkLoginRateLimit(alice).allowed).toBe(false)
  })

  it('forgets the failures after a successful sign-in', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(alice)
    clearLoginRateLimit(alice)

    expect(checkLoginRateLimit(alice).allowed).toBe(true)
  })

  it('allows the first five attempts', () => {
    for (let i = 0; i < 4; i++) {
      recordLoginFailure(alice)
      expect(checkLoginRateLimit(alice).allowed).toBe(true)
    }
    recordLoginFailure(alice)

    expect(checkLoginRateLimit(alice).allowed).toBe(false)
  })
})

describe('the reset throttle', () => {
  it('allows three requests and refuses the fourth', () => {
    for (let i = 0; i < 3; i++) expect(checkResetRateLimit(alice).allowed).toBe(true)

    const fourth = checkResetRateLimit(alice)

    expect(fourth.allowed).toBe(false)
    expect(fourth.retryAfter).toBeGreaterThan(0)
  })

  it('keeps its own count, so a reset flood cannot lock a sign-in', () => {
    for (let i = 0; i < 4; i++) checkResetRateLimit(alice)

    expect(checkResetRateLimit(alice).allowed).toBe(false)
    expect(checkLoginRateLimit(alice).allowed).toBe(true)
  })

  it('does not spend the login budget on resets', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(alice)

    expect(checkLoginRateLimit(alice).allowed).toBe(false)
    expect(checkResetRateLimit(alice).allowed).toBe(true)
  })

  it('leaves another account alone', () => {
    for (let i = 0; i < 4; i++) checkResetRateLimit(alice)

    expect(checkResetRateLimit('bob@example.test').allowed).toBe(true)
  })
})

describe('the memory the throttle keeps', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops accounts that have been quiet for longer than the window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-30T10:00:00Z'))
    for (let i = 0; i < 1001; i++) recordLoginFailure(`attacker${i}@example.test`)

    vi.setSystemTime(new Date('2026-10-30T10:20:00Z'))
    recordLoginFailure('one-more@example.test')

    // Every older key is outside the fifteen minute window, so the sweep has
    // nothing to keep once it is forced to run.
    expect(loginRateLimitSize()).toBeLessThan(10)
  })
})

describe('a flood of invented addresses', () => {
  it('does not unlock an account that is already throttled', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(alice)
    for (let i = 0; i < 1500; i++) recordLoginFailure(`noise${i}@example.test`)

    expect(checkLoginRateLimit(alice).allowed).toBe(false)
  })
})
