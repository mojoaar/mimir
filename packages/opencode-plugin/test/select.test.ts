import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { selectFiles } from '../src/select.js'

let root: string

async function put(path: string, body = 'x'): Promise<void> {
  const full = join(root, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, body)
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mimir-select-'))
  await put('README.md')
  await put('docs/architecture.md')
  await put('docs/deep/nested/notes.md')
  await put('docs/Ærø Skibsfart.md')
  await put('src/index.ts')
  await put('src/deep/a/b/c/d/notes.md')
  await put('node_modules/x/readme.md')
  await put('assets/logo.png')
  await put('big.md', 'x'.repeat(300 * 1024))
  await put('notes.txt')
  await put('package.json', '{}')
  await put('.env.example')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('selectFiles', () => {
  it('keeps documentation and configuration by default', async () => {
    const { files } = await selectFiles(root)
    const paths = files.map((f) => f.path).sort()

    expect(paths).toEqual([
      '.env.example',
      'README.md',
      'docs/architecture.md',
      'docs/deep/nested/notes.md',
      'docs/Ærø Skibsfart.md',
      'package.json',
    ])
  })

  it('leaves source code, dependencies and binaries alone by default', async () => {
    const { files } = await selectFiles(root)
    const paths = files.map((f) => f.path)

    expect(paths).not.toContain('src/index.ts')
    expect(paths).not.toContain('src/deep/a/b/c/d/notes.md')
    expect(paths).not.toContain('node_modules/x/readme.md')
    expect(paths).not.toContain('assets/logo.png')
    expect(paths).not.toContain('notes.txt')
  })

  it('takes everything when asked, except what is never worth sending', async () => {
    const { files } = await selectFiles(root, { all: true })
    const paths = files.map((f) => f.path)

    expect(paths).toContain('src/index.ts')
    expect(paths).toContain('src/deep/a/b/c/d/notes.md')
    expect(paths).toContain('notes.txt')
    expect(paths).not.toContain('node_modules/x/readme.md')
    expect(paths).not.toContain('assets/logo.png')
  })

  it('reports a file too large to import instead of dropping it quietly', async () => {
    for (const options of [undefined, { all: true }] as const) {
      const { files, skipped } = await selectFiles(root, options)

      expect(files.map((f) => f.path)).not.toContain('big.md')
      expect(skipped).toEqual([{ path: 'big.md', reason: 'too large (307200 bytes)' }])
    }
  })

  it('keeps an awkward filename instead of losing it', async () => {
    const { files } = await selectFiles(root)
    const entry = files.find((f) => f.path === 'docs/Ærø Skibsfart.md')

    expect(entry).toBeDefined()
    expect(entry?.bytes).toBeGreaterThan(0)
  })
})
