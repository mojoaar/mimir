import { describe, expect, it } from 'vitest'
import { rrfFuse } from './rrf'

describe('rrfFuse', () => {
  it('rewards agreement between two lists', () => {
    const fused = rrfFuse([['a', 'b'], ['b', 'c']])
    expect(fused[0]!.id).toBe('b')
  })

  it('uses k = 60 by default', () => {
    expect(rrfFuse([['a']])[0]!.score).toBeCloseTo(1 / 61)
  })

  it('drops nothing and keeps one entry per id', () => {
    const fused = rrfFuse([['a', 'a'], ['a']])
    expect(fused).toHaveLength(1)
  })
})
