import { beforeEach, describe, expect, it } from 'vitest'
import { checkLoginRateLimit, clearLoginRateLimit, recordLoginFailure, resetLoginRateLimit } from './rate-limit'

const alice = 'Alice@Example.test'

beforeEach(() => {
  resetLoginRateLimit()
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
