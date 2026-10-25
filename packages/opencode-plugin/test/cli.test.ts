import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown>; options?: { timeoutMs?: number } }[],
  reply: { ok: true, result: { written: 0 } } as unknown,
  repo: null as string | null,
}))

vi.mock('../src/client.js', () => ({
  callTool: async (name: string, args: Record<string, unknown>, options?: { timeoutMs?: number }) => {
    mocks.calls.push({ name, args, options })
    return mocks.reply
  },
  detectRepo: () => mocks.repo,
}))

const { runIngest } = await import('../src/cli.js')

let root: string
const out: string[] = []
const err: string[] = []

function io() {
  return { out: (line: string) => out.push(line), err: (line: string) => err.push(line), cwd: root }
}

async function put(path: string, body = 'x'): Promise<void> {
  const full = join(root, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, body)
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mimir-cli-'))
  await put('README.md', '# notes')
  await put('docs/a.md', 'alpha')
  await put('docs/b.md', 'beta')
  await put('package.json', '{}')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  out.length = 0
  err.length = 0
  mocks.calls.length = 0
  mocks.repo = null
  mocks.reply = { ok: true, result: { written: 3 } }
})

describe('mimir ingest', () => {
  it('prints the plan and sends nothing on a dry run', async () => {
    const code = await runIngest(
      { command: 'ingest', path: '.', project: 'import-check', all: false, dryRun: true, help: false },
      io(),
    )

    expect(code).toBe(0)
    expect(mocks.calls).toHaveLength(0)
    expect(out.join('\n')).toContain('would import 4 files')
    expect(out.join('\n')).toContain('import-check')
  })

  it('sends one batch of files through memory_ingest', async () => {
    const code = await runIngest(
      { command: 'ingest', path: '.', project: 'import-check', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(0)
    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]?.name).toBe('memory_ingest')
    expect(mocks.calls[0]?.args.project).toBe('import-check')
    expect((mocks.calls[0]?.args.files as unknown[]).length).toBe(4)
    expect(out.join('\n')).toContain('imported 3 files')
  })

  it('imports into the repo the agents already use', async () => {
    mocks.repo = 'github.com/alice/notes'

    await runIngest(
      { command: 'ingest', path: '.', all: false, dryRun: false, help: false },
      io(),
    )

    expect(mocks.calls[0]?.args.repo).toBe('github.com/alice/notes')
    expect(mocks.calls[0]?.args.project).toBeUndefined()
  })

  it('lets --project override the repository name', async () => {
    mocks.repo = 'github.com/alice/notes'

    await runIngest(
      { command: 'ingest', path: '.', project: 'x', all: false, dryRun: false, help: false },
      io(),
    )

    expect(mocks.calls[0]?.args.project).toBe('x')
    expect(mocks.calls[0]?.args.repo).toBeUndefined()
  })

  it('splits a big selection into several batches', async () => {
    for (let i = 0; i < 120; i++) await put(`docs/bulk/f${i}.md`, 'x')
    mocks.reply = { ok: true, result: { written: 0 } }

    await runIngest(
      { command: 'ingest', path: '.', project: 'p', all: false, dryRun: false, help: false },
      io(),
    )

    expect(mocks.calls.length).toBeGreaterThan(1)
  })

  it('reports a failed batch and keeps going', async () => {
    mocks.reply = { ok: false, error: 'unauthorized' }

    const code = await runIngest(
      { command: 'ingest', path: '.', project: 'p', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(1)
    expect(err.join('\n')).toContain('batch 1 failed: unauthorized')
  })

  it('refuses a directory that is not there', async () => {
    const code = await runIngest(
      { command: 'ingest', path: 'nope', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(2)
    expect(err.join('\n')).toContain('no such directory')
  })

  it('names a file too large and still imports the rest', async () => {
    await put('docs/big.md', 'x'.repeat(300 * 1024))

    const code = await runIngest(
      { command: 'ingest', path: '.', project: 'p', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(1)
    expect(err.join('\n')).toContain('docs/big.md')
    const sent = mocks.calls.flatMap((call) => (call.args.files as { path: string }[]).map((f) => f.path))
    expect(sent).not.toContain('docs/big.md')
  })

  it('prints usage for --help without touching the disk', async () => {
    const code = await runIngest(
      { command: 'ingest', path: 'nope', all: false, dryRun: false, help: true },
      io(),
    )

    expect(code).toBe(0)
    expect(out.join('\n')).toContain('mimir ingest')
    expect(mocks.calls).toHaveLength(0)
  })
})
