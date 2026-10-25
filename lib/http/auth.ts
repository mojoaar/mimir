import { resolveApiKey } from '@/lib/auth/apikey'
import { checkApiRateLimit } from '@/lib/auth/rate-limit'
import type { AuthUser } from '@/lib/auth/types'
import { RateLimited, Unauthorized } from './errors'

export async function withApiAuth(request: Request): Promise<{ user: AuthUser }> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const user = token ? await resolveApiKey(token) : null
  if (!user) throw new Unauthorized()

  const limit = checkApiRateLimit(user.id)
  if (!limit.allowed) throw new RateLimited(limit.retryAfter)

  return { user }
}
