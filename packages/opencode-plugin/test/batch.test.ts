import { describe, expect, it } from 'vitest'

import { batchFiles } from '../src/batch.js'

const file = (bytes: number, name = 'a.md'): { path: string; bytes: number } => ({ path: name, bytes })

describe('batchFiles', () => {
  it('splits a large selection into server-sized batches', () => {
    const files = Array.from({ length: 250 }, (_, i) => file(10, `f${i}.md`))
    const batches = batchFiles(files)

    expect(batches.map((b) => b.files.length)).toEqual([100, 100, 50])
    expect(batches[0]?.files[0]?.path).toBe('f0.md')
    expect(batches[2]?.files.at(-1)?.path).toBe('f249.md')
  })

  it('starts a new batch at the byte ceiling', () => {
    const batches = batchFiles([
      file(1.5 * 1024 * 1024, 'big.md'),
      file(0.6 * 1024 * 1024, 'next.md'),
      file(10, 'small.md'),
    ])

    expect(batches.map((b) => b.files.map((f) => f.path))).toEqual([
      ['big.md'],
      ['next.md', 'small.md'],
    ])
  })

  it('keeps one file too large for any batch in a batch of its own', () => {
    const batches = batchFiles([file(3 * 1024 * 1024, 'huge.md')], 100, 2 * 1024 * 1024)

    expect(batches).toHaveLength(1)
    expect(batches[0]?.files[0]?.path).toBe('huge.md')
  })

  it('returns nothing for nothing', () => {
    expect(batchFiles([])).toEqual([])
  })
})
