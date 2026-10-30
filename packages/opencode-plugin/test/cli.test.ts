import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as {
    name: string
    args: Record<string, unknown>
    options?: { timeoutMs?: number; url?: string; token?: string }
  }[],
  reply: { ok: true, result: { written: 0 } } as unknown,
  route: { ok: true, body: JSON.stringify({ results: [] }) } as unknown,
  routes: [] as { path: string; options?: { method?: string; body?: unknown } }[],
  repo: null as string | null,
}))

vi.mock('../src/client.js', () => ({
  callTool: async (
    name: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number; url?: string; token?: string },
  ) => {
    mocks.calls.push({ name, args, options })
    return mocks.reply
  },
  callRoute: async (path: string, options?: { method?: string; body?: unknown }) => {
    mocks.routes.push({ path, options })
    return mocks.route
  },
  detectRepo: () => mocks.repo,
}))

const { runExport, runIngest, runSearch } = await import('../src/cli.js')
const { parseArgs } = await import('../src/args.js')

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
  mocks.routes.length = 0
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


  it('refuses a folder that is neither a repository nor named', async () => {
    mocks.repo = null

    const code = await runIngest(
      { command: 'ingest', path: '.', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(2)
    expect(err.join('\n')).toContain('not a git repository')
    expect(mocks.calls).toHaveLength(0)
  })

  it('sends the url and token it was given', async () => {
    await runIngest(
      {
        command: 'ingest',
        path: '.',
        project: 'p',
        url: 'http://127.0.0.1:3101',
        token: 'mimir_test',
        all: false,
        dryRun: false,
        help: false,
      },
      io(),
    )

    expect(mocks.calls[0]?.options?.url).toBe('http://127.0.0.1:3101')
    expect(mocks.calls[0]?.options?.token).toBe('mimir_test')
  })

  it('skips a file that is only too large once decoded', async () => {
    // 200 KiB of 0xff decodes to 200 K replacement characters, which is 600 KB.
    await put('docs/latin1.md', Buffer.alloc(200 * 1024, 0xff) as unknown as string)

    const code = await runIngest(
      { command: 'ingest', path: '.', project: 'p', all: false, dryRun: false, help: false },
      io(),
    )

    expect(code).toBe(1)
    expect(err.join('\n')).toContain('docs/latin1.md')
    const sent = mocks.calls.flatMap((call) => (call.args.files as { path: string }[]).map((f) => f.path))
    expect(sent).not.toContain('docs/latin1.md')
    expect(sent).toContain('docs/a.md')
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

describe('parseArgs', () => {
  it('reads a search query and its flags', () => {
    expect(parseArgs(['search', 'rollback', '--limit', '5'])).toMatchObject({
      command: 'search',
      query: 'rollback',
      limit: 5,
    })
  })

  it('reads an export target', () => {
    expect(parseArgs(['export', '--out', 'mimir.md'])).toMatchObject({
      command: 'export',
      out: 'mimir.md',
    })
  })

  it('still refuses a flag it does not know', () => {
    expect(() => parseArgs(['search', 'x', '--nope'])).toThrow('unknown flag --nope')
  })
})

describe('mimir search', () => {
  it('prints one line per hit', async () => {
    mocks.route = {
      ok: true,
      body: JSON.stringify({
        results: [{ path: 'deploy/rollback', title: 'Roll back by redeploying', projectSlug: 'mimir' }],
      }),
    }

    const code = await runSearch({ command: 'search', query: 'rollback', help: false }, io())

    expect(code).toBe(0)
    expect(mocks.routes[0]?.path).toBe('/api/v1/search')
    expect(mocks.routes[0]?.options?.body).toMatchObject({ query: 'rollback' })
    expect(out.join('\n')).toContain('deploy/rollback - Roll back by redeploying')
  })

  it('names the project when the search covers all of them', async () => {
    mocks.route = {
      ok: true,
      body: JSON.stringify({
        results: [{ path: 'deploy/rollback', title: 'Roll back', projectSlug: 'mimir' }],
      }),
    }

    await runSearch({ command: 'search', query: 'rollback', help: false }, io())

    expect(out.join('\n')).toContain('mimir: deploy/rollback - Roll back')
  })

  it('says when nothing matches', async () => {
    mocks.route = { ok: true, body: JSON.stringify({ results: [] }) }

    const code = await runSearch({ command: 'search', query: 'zzz', help: false }, io())

    expect(code).toBe(0)
    expect(out.join('\n')).toContain('Nothing matches')
  })

  it('prints one readable error when Mimir refuses', async () => {
    mocks.route = { ok: false, error: 'unauthorized' }

    const code = await runSearch({ command: 'search', query: 'x', help: false }, io())

    expect(code).toBe(1)
    expect(err.join('\n')).toContain('unauthorized')
  })
})

describe('mimir export', () => {
  it('writes the file it was given and says how big it is', async () => {
    const target = join(root, 'mimir.md')
    const body = '# Mimir\n\n## deploy/rollback\n'
    mocks.route = { ok: true, body }

    const code = await runExport({ command: 'export', project: 'mimir', out: target, help: false }, io())

    expect(code).toBe(0)
    expect(mocks.routes[0]?.path).toBe('/api/v1/projects/mimir/export')
    expect(await readFile(target, 'utf8')).toContain('## deploy/rollback')
    expect(out.join('\n')).toContain(`${Buffer.byteLength(body, 'utf8')} bytes`)
  })

  it('asks which project when none is named or obvious', async () => {
    mocks.reply = { ok: true, result: [{ slug: 'mimir' }, { slug: 'sigrun' }] }

    const code = await runExport({ command: 'export', help: false }, io())

    expect(code).toBe(1)
    expect(err.join('\n')).toContain('Pick one of:')
    expect(err.join('\n')).toContain('sigrun')
  })
})
