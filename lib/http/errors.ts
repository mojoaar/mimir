export class Unauthorized extends Error {
  readonly code = 'unauthorized' as const
  constructor(message = 'missing or invalid API key') {
    super(message)
    this.name = 'Unauthorized'
  }
}

export class RateLimited extends Error {
  readonly code = 'rate_limited' as const
  constructor(readonly retryAfter: number) {
    super('too many requests')
    this.name = 'RateLimited'
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  project_not_found: 404,
  invalid_path: 400,
  invalid_params: 400,
  body_too_large: 413,
  rate_limited: 429,
}

export function toResponse(error: unknown): Response {
  const code = (error as { code?: unknown } | null)?.code
  const status = typeof code === 'string' ? STATUS_BY_CODE[code] : undefined
  const message = error instanceof Error ? error.message : 'internal error'

  if (status === undefined) {
    console.error('unhandled api error', error)
    return Response.json({ error: 'internal error' }, { status: 500 })
  }

  const headers: Record<string, string> = {}
  if (error instanceof RateLimited) headers['retry-after'] = String(error.retryAfter)
  if (status === 401) headers['www-authenticate'] = 'Bearer'

  return Response.json({ error: message, code }, { status, headers })
}
