const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

// In-process is enough because there is exactly one process (see spec §12).
// A second replica would have to move this to Postgres; the users.failed_logins
// columns already keep the lock across restarts.
const attempts = new Map<string, number[]>()

function key(ip: string | null, email: string): string {
  return `${ip ?? '-'}|${email.trim().toLowerCase()}`
}

export function checkLoginRateLimit(
  ip: string | null,
  email: string,
): { allowed: boolean; retryAfter: number } {
  const k = key(ip, email)
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

export function recordLoginFailure(ip: string | null, email: string): void {
  const k = key(ip, email)
  attempts.set(k, [...(attempts.get(k) ?? []), Date.now()])
}

export function clearLoginRateLimit(ip: string | null, email: string): void {
  attempts.delete(key(ip, email))
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
