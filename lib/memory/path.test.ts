import { describe, expect, it } from 'vitest'
import { BodyTooLarge, InvalidPath, MAX_BODY_BYTES, MAX_PATH_LENGTH, normalisePath } from './path'

describe('normalisePath', () => {
  it.each([
    ['Auth/JWT/Refresh-Rotation', 'auth/jwt/refresh-rotation'],
    ['/deploy//compose/', 'deploy/compose'],
    ['a b', 'a-b'],
    [' a  b ', 'a-b'],
    ['notes.md', 'notes.md'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePath(input)).toBe(expected)
  })

  it.each([
    ['café', 'non-ascii'],
    ['caf!', 'punctuation'],
    ['   ', 'whitespace only'],
    ['a/./b', 'dot segment'],
  ])('rejects %s instead of rewriting it', (input) => {
    try {
      normalisePath(input)
      expect.unreachable(`${input} should have been rejected`)
    } catch (error) {
      expect((error as InvalidPath).code).toBe('invalid_path')
    }
  })

  it.each([
    ['deploy/ ', 'whitespace-only trailing segment'],
    [' /deploy', 'whitespace-only leading segment'],
    ['a/ /b', 'whitespace-only middle segment'],
  ])('rejects %s instead of collapsing onto a neighbour', (input) => {
    // Trimming the whole string would turn 'deploy/ ' into 'deploy' and the
    // write would silently land on an existing memory.
    expect(() => normalisePath(input)).toThrow(/invalid_path: .*whitespace-only segment/)
  })

  it('names the offending character so an agent can fix its path', () => {
    expect(() => normalisePath('caf!')).toThrow(/invalid_path: .*'!'/)
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

  it('does not label a size error as a path error', () => {
    expect(new BodyTooLarge(MAX_BODY_BYTES + 1).message).toMatch(/^body_too_large:/)
  })

  it('accepts a path exactly at the limit', () => {
    expect(normalisePath('a'.repeat(MAX_PATH_LENGTH))).toHaveLength(MAX_PATH_LENGTH)
  })
})
