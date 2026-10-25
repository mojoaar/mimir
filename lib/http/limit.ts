/**
 * Refuses an oversized request before `request.json()` parses it. The per-field
 * cap in the memory service runs after the whole body is already in memory, so
 * a stolen key could otherwise OOM the single process.
 */
export const MAX_REQUEST_BYTES = 1024 * 1024

export function rejectOversized(
  request: { headers: Headers },
  maxBytes: number = MAX_REQUEST_BYTES,
): Response | null {
  const raw = request.headers.get('content-length')
  if (!raw) return null
  const declared = Number(raw)
  if (!Number.isFinite(declared) || declared <= maxBytes) return null
  return Response.json(
    { error: `request body must be at most ${maxBytes} bytes`, code: 'body_too_large' },
    { status: 413 },
  )
}
