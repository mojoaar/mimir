import type { NextRequest } from 'next/server'
import type { AuthUser } from '@/lib/auth/types'
import { audit } from '@/lib/audit'
import { getConfig } from '@/lib/config'
import { toResponse } from './errors'
import { blockedResponse, isRequestAllowed } from './allowlist'
import { clientIp } from './ip'
import { rejectOversized } from './limit'

/**
 * The one place a REST call authenticates, is size-checked, has its errors
 * mapped, and leaves exactly one audit row - the same contract the MCP
 * endpoint keeps. Without this a shell script could read and delete memory
 * with no trace.
 *
 * An unauthenticated call writes no row: there is no actor to attribute it to,
 * and login is the surface that records those attempts.
 */
export async function withAudit(
  request: NextRequest,
  action: string,
  run: (user: AuthUser) => Promise<Response>,
  options: { maxBytes?: number; detail?: Record<string, unknown> } = {},
): Promise<Response> {
  // Before authentication, so a blocked caller learns nothing about keys.
  if (!(await isRequestAllowed(request))) return blockedResponse()

  const tooLarge = rejectOversized(request, options.maxBytes)
  if (tooLarge) return tooLarge

  let user: AuthUser
  try {
    ;({ user } = await withApiAuthLazy(request))
  } catch (error) {
    return toResponse(error)
  }

  let response: Response
  try {
    response = await run(user)
  } catch (error) {
    response = toResponse(error)
  }

  await audit({
    actorType: 'agent',
    actorId: user.id,
    action,
    targetType: 'api',
    targetId: new URL(request.url).pathname,
    detail:
      response.status >= 400
        ? { ...options.detail, ok: false, status: response.status }
        : { ...options.detail, ok: true },
    ip: clientIp(request.headers, getConfig().trustedProxies, null) ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  return response
}

// Imported lazily through this shim so the module graph stays acyclic when auth
// grows to depend on settings.
async function withApiAuthLazy(request: NextRequest) {
  const { withApiAuth } = await import('./auth')
  return withApiAuth(request)
}
