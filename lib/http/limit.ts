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

export class PayloadTooLarge extends Error {
  readonly code = 'body_too_large'

  constructor(maxBytes: number) {
    super(`request body must be at most ${maxBytes} bytes`)
    this.name = 'PayloadTooLarge'
  }
}

export class InvalidBody extends Error {
  readonly code = 'invalid_params'

  constructor() {
    super('body is not valid JSON')
    this.name = 'InvalidBody'
  }
}

/**
 * A declared Content-Length is a claim, not a fact: a chunked body has none.
 * The cap has to be enforced while reading, or one authenticated caller can
 * stream the single process out of memory.
 */
export async function readJson<T>(request: Request, maxBytes: number = MAX_REQUEST_BYTES): Promise<T> {
  const body = request.body
  if (!body) throw new InvalidBody()

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new PayloadTooLarge(maxBytes)
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    throw new InvalidBody()
  }
}
