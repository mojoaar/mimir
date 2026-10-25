import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs typescript tests', () => {
    const add = (a: number, b: number) => a + b
    expect(add(2, 3)).toBe(5)
  })
})
