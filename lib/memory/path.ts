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

export class BodyTooLarge extends Error {
  readonly code = 'body_too_large'
  constructor(size: number) {
    super(`invalid_path: body is ${size} bytes, the limit is ${MAX_BODY_BYTES}`)
    this.name = 'BodyTooLarge'
  }
}

/**
 * `..` is rejected before anything is stripped, because a rewrite could turn a
 * traversal into something that looks harmless while still resolving upwards.
 */
export function normalisePath(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidPath('path must be a string')

  let path = raw.toLowerCase()

  if (path.includes('..')) throw new InvalidPath('traversal (..) is not allowed')

  path = path
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._/-]/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  if (path === '') throw new InvalidPath('path is empty after normalisation')
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
