import { getConfig } from '@/lib/config'
import { getIpAllowlist } from '@/lib/settings/security'
import { matchesAnyCidr } from './cidr'
import { clientIp } from './ip'

const CACHE_MS = 30_000

let cached: { list: string[]; at: number } | null = null

/**
 * An empty list means "no restriction". A non-empty list denies a caller whose
 * address cannot be resolved, because a missing address is the one case where
 * allowing would defeat the point.
 */
export function isAllowedIp(ip: string | null, allowlist: readonly string[]): boolean {
  return matchesAnyCidr(ip, allowlist)
}

/** Cached because this runs on every request; the admin action invalidates it. */
export async function getCachedAllowlist(): Promise<string[]> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) return cached.list
  const list = await getIpAllowlist()
  cached = { list, at: now }
  return list
}

export function invalidateAllowlistCache(): void {
  cached = null
}

export async function isRequestAllowed(request: { headers: Headers }): Promise<boolean> {
  const allowlist = await getCachedAllowlist()
  if (allowlist.length === 0) return true
  const ip = clientIp(request.headers, getConfig().trustedProxies, null)
  return isAllowedIp(ip, allowlist)
}

export function blockedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'forbidden', detail: 'this address is not allowed' }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  )
}
