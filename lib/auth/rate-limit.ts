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

export function recordLoginFailure(account: string): void {
  const k = key(account)
  attempts.set(k, [...(attempts.get(k) ?? []), Date.now()])
}

export function clearLoginRateLimit(account: string): void {
  attempts.delete(key(account))
}

/** Test hook: the window has no clock to advance, so tests clear it instead. */
export function resetLoginRateLimit(): void {
  attempts.clear()
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
