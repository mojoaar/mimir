const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

// One process, so an in-process map is enough; a second replica would have to
// move this to Postgres. The real backstop is users.failed_logins /
// locked_until, which survives a restart. The key is the account alone: the
// runtime cannot see a client address without trusted proxies, so including it
// would only make the throttle lie.
const attempts = new Map<string, number[]>()

function key(account: string): string {
  return account.trim().toLowerCase()
}

export function checkLoginRateLimit(account: string): { allowed: boolean; retryAfter: number } {
  const k = key(account)
  const now = Date.now()
  const recent = (attempts.get(k) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length === 0) attempts.delete(k)
  else attempts.set(k, recent)

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0] ?? now
    return { allowed: false, retryAfter: Math.ceil((oldest + WINDOW_MS - now) / 1000) }
  }
  return { allowed: true, retryAfter: 0 }
}

const SWEEP_ABOVE = 1000

export function recordLoginFailure(account: string): void {
  const k = key(account)
  const now = Date.now()
  if (attempts.size > SWEEP_ABOVE) sweep(now)
  attempts.set(k, [...(attempts.get(k) ?? []), now])
}

/**
 * An attacker picks the address, so one key per guess is memory they get for
 * free. Stale keys go first; if a burst inside one window still pushes the map
 * past the cap, the least recently seen keys go instead. Never clear it: that
 * would hand an attacker a way to unlock every account at once.
 */
function sweep(now: number): void {
  for (const [k, times] of attempts) {
    const newest = times[times.length - 1] ?? 0
    if (now - newest >= WINDOW_MS) attempts.delete(k)
  }
  // An entry that is already over the limit is a live lockout, and an attacker
  // must not be able to evict it by filling the map with invented addresses.
  while (attempts.size > SWEEP_ABOVE) {
    let victim: string | null = null
    let victimAt = Infinity
    let fallback: string | null = null
    let fallbackAt = Infinity
    for (const [k, times] of attempts) {
      const newest = times[times.length - 1] ?? 0
      if (newest < fallbackAt) {
        fallbackAt = newest
        fallback = k
      }
      if (times.length < MAX_ATTEMPTS && newest < victimAt) {
        victimAt = newest
        victim = k
      }
    }
    const drop = victim ?? fallback
    if (drop === null) break
    attempts.delete(drop)
  }
}

/** Test hook: the sweep is otherwise only visible in the process heap. */
export function loginRateLimitSize(): number {
  return attempts.size
}

export function clearLoginRateLimit(account: string): void {
  attempts.delete(key(account))
}

/** Test hook: the window has no clock to advance, so tests clear it instead. */
export function resetLoginRateLimit(): void {
  attempts.clear()
}

// A reset email is not a login attempt, and a spammer must not be able to lock a
// victim out of signing in by requesting resets for their address. Its own bucket.
const RESET_WINDOW_MS = 15 * 60 * 1000
const RESET_MAX_REQUESTS = 3
const resetHits = new Map<string, number[]>()

export function checkResetRateLimit(account: string): { allowed: boolean; retryAfter: number } {
  const k = key(account)
  const now = Date.now()
  const recent = (resetHits.get(k) ?? []).filter((at) => now - at < RESET_WINDOW_MS)
  if (recent.length >= RESET_MAX_REQUESTS) {
    resetHits.set(k, recent)
    const oldest = recent[0] ?? now
    return { allowed: false, retryAfter: Math.ceil((oldest + RESET_WINDOW_MS - now) / 1000) }
  }
  recent.push(now)
  resetHits.set(k, recent)
  return { allowed: true, retryAfter: 0 }
}

/** Test hook. */
export function resetResetRateLimit(): void {
  resetHits.clear()
}

const API_WINDOW_MS = 60_000
const API_MAX_REQUESTS = 60
const apiHits = new Map<string, number[]>()

/** 60 requests a minute per user across MCP and REST. In-process: there is one process. */
export function checkApiRateLimit(actorId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const recent = (apiHits.get(actorId) ?? []).filter((at) => now - at < API_WINDOW_MS)
  if (recent.length >= API_MAX_REQUESTS) {
    const oldest = recent[0] ?? now
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((API_WINDOW_MS - (now - oldest)) / 1000)) }
  }
  recent.push(now)
  apiHits.set(actorId, recent)
  return { allowed: true, retryAfter: 0 }
}

/** Test hook. */
export function resetApiRateLimit(): void {
  apiHits.clear()
}
