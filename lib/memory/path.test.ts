import { describe, expect, it } from 'vitest'
import { MAX_PATH_LENGTH, normalisePath } from './path'

describe('normalisePath', () => {
  it.each([
    ['Auth/JWT/Refresh-Rotation', 'auth/jwt/refresh-rotation'],
    ['/deploy//compose/', 'deploy/compose'],
    ['a b', 'a-b'],
    ['café', 'caf'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePath(input)).toBe(expected)
  })

  it.each(['../etc/passwd', 'a/../../b', 'a/../b'])('rejects traversal %s', (p) => {
    expect(() => normalisePath(p)).toThrow(/invalid_path|traversal/)
  })

  it('rejects a path longer than the limit', () => {
    expect(() => normalisePath('a'.repeat(513))).toThrow(/512/)
  })

  it('rejects a path that normalises to nothing', () => {
    expect(() => normalisePath('///')).toThrow()
  })

  it('carries a stable error code for callers to map to a JSON-RPC error', () => {
    try {
      normalisePath('../x')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_path' })
    }
  })

  it('accepts a path exactly at the limit', () => {
    expect(normalisePath('a'.repeat(MAX_PATH_LENGTH))).toHaveLength(MAX_PATH_LENGTH)
  })
})
