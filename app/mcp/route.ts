import { NextRequest } from 'next/server'
import { resolveApiKey } from '@/lib/auth/apikey'
import { clientIp } from '@/lib/http/ip'
import { getConfig } from '@/lib/config'
import { checkApiRateLimit } from '@/lib/auth/rate-limit'
import { handleRpc } from '@/lib/mcp/server'
import { PARSE_ERROR, rpcError } from '@/lib/mcp/errors'

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const user = token ? await resolveApiKey(token) : null

  if (!user) {
    return json(
      { jsonrpc: '2.0', id: null, error: rpcError(-32001, 'unauthorized', 'missing or invalid API key') },
      401,
      { 'www-authenticate': 'Bearer' },
    )
  }

  const limit = checkApiRateLimit(user.id)
  if (!limit.allowed) {
    return json(
      { jsonrpc: '2.0', id: null, error: rpcError(-32000, 'rate_limited', 'too many requests') },
      429,
      { 'retry-after': String(limit.retryAfter) },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(
      { jsonrpc: '2.0', id: null, error: rpcError(PARSE_ERROR, 'parse_error', 'body is not valid JSON') },
      400,
    )
  }

  const response = await handleRpc(body, user, {
    ip: clientIp(request.headers, getConfig().trustedProxies, null),
    userAgent: request.headers.get('user-agent'),
    repo: request.headers.get('x-mimir-repo'),
  })

  // A notification has no reply; 202 tells the client it was accepted.
  if (response === null) return new Response(null, { status: 202 })

  return json(response, 200)
}

export async function GET() {
  return new Response(null, { status: 405, headers: { allow: 'POST' } })
}
