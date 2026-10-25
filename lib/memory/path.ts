export const MAX_PATH_LENGTH = 512
export const MAX_BODY_BYTES = 262144
export const TITLE_MAX = 120

export class InvalidPath extends Error {
  readonly code = 'invalid_path'
  constructor(reason: string) {
    super(`invalid_path: ${reason}`)
    this.name = 'InvalidPath'
  }
}

export class InvalidInput extends Error {
  readonly code = 'invalid_params' as const
  constructor(reason: string) {
    super(`invalid_params: ${reason}`)
    this.name = 'InvalidInput'
  }
}

export class BodyTooLarge extends Error {
  readonly code = 'body_too_large'
  constructor(size: number) {
    super(`body_too_large: body is ${size} bytes, the limit is ${MAX_BODY_BYTES}`)
    this.name = 'BodyTooLarge'
  }
}

/**
 * `..` is rejected before anything is stripped, because a rewrite could turn a
 * traversal into something that looks harmless while still resolving upwards.
 *
 * Everything outside `[a-z0-9._/-]` is rejected rather than removed: stripping
 * would map `café` and `caf!` onto the same path, and the second write would
 * silently overwrite the first.
 */
export function normalisePath(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidPath('path must be a string')

  const lower = raw.toLowerCase()
  if (lower.includes('..')) throw new InvalidPath('traversal (..) is not allowed')

  const trimmed = lower.trim()
  if (trimmed === '') throw new InvalidPath('path is empty')

  const path = trimmed
    .replace(/\s+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')

  for (const segment of path.split('/')) {
    if (segment === '') throw new InvalidPath('path has an empty segment')
    if (segment === '.') throw new InvalidPath("path must not contain '.' segments")
  }

  const bad = path.match(/[^a-z0-9._/-]/)
  if (bad) {
    throw new InvalidPath(`'${bad[0]}' is not allowed in a path (use a-z, 0-9, '.', '_', '/' or '-')`)
  }

  if (path.length > MAX_PATH_LENGTH) {
    throw new InvalidPath(`path is ${path.length} characters, the limit is ${MAX_PATH_LENGTH}`)
  }

  return path
}

export function titleFromBody(body: string): string {
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return (firstLine ?? '').slice(0, TITLE_MAX)
}
