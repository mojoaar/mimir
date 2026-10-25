import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, symlinkSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The unit tests import runIngest directly, so they can never see how the
// command behaves once it is published: npm links the bin as `.bin/mimir`, and
// the file is executed as `node <real path>` only after that indirection. These
// tests build the package and run the artifact.
const pkg = fileURLToPath(new URL('..', import.meta.url))
// test/ → package/ → packages/ → repo root
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const bin = join(pkg, 'dist/bin.js')

let scratch: string

beforeAll(() => {
  execFileSync(join(repo, 'node_modules/.bin/tsc'), ['-p', join(pkg, 'tsconfig.json')], {
    stdio: 'ignore',
  })
}, 120_000)

afterAll(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true })
})

describe('the built command', () => {
  it('prints usage when run directly', () => {
    const result = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('mimir ingest')
  })

  it('still runs when invoked through a symlink, the way npm links a bin', () => {
    scratch = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim()
    const link = join(scratch, 'mimir')
    chmodSync(bin, 0o755)
    symlinkSync(bin, link)

    const result = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('mimir ingest')
  })
})

describe('detectRepo in a real ESM process', () => {
  it('reads the origin of a git checkout', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'mimir-git-'))
    execFileSync('git', ['init', '--quiet'], { cwd: scratch })
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:alice/notes.git'], { cwd: scratch })

    const probe = join(scratch, 'probe.mjs')
    await writeFile(
      probe,
      `import { detectRepo } from ${JSON.stringify(join(pkg, 'dist/client.js'))}\n` +
        `console.log(detectRepo(process.argv[2]))\n`,
    )

    const result = spawnSync(process.execPath, [probe, scratch], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('git@github.com:alice/notes.git')
  })
})
