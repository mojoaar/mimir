#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parseArgs, type Args, type ExportArgs, type IngestArgs, type SearchArgs } from './args.js'
import { batchFiles } from './batch.js'
import { callRoute, callTool, detectRepo } from './client.js'
import { selectFiles } from './select.js'

const USAGE = `mimir — long-term memory for an agent

  mimir ingest [path] [options]      load a project's documentation
  mimir search <query> [options]     search every project you can read
  mimir export [options]            write a project out as one markdown file

  --project <name>  name the project yourself. Required for a folder that is
                    not a git repository, and for export.
  --url <url>       Mimir base URL (default: MIMIR_URL)
  --token <token>   API key (default: MIMIR_TOKEN)
  --all             import every text file, not just documentation
  --dry-run         print what would be sent and send nothing
  --limit <n>       search: how many hits to ask for
  --out <file>      export: where to write it (default: <project>.md)

A git checkout imports into the project your agents already write to. Imports
land under import/, where memory_search finds them.`

const MAX_BODY_BYTES = 262_144

export type IngestIo = {
  out: (line: string) => void
  err: (line: string) => void
  cwd: string
}

type Prepared = { path: string; body: string; bytes: number }
type Skip = { path: string; reason: string }

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Returns the exit code instead of calling process.exit, so the whole command
 * is testable and a caller can decide what a partial import means.
 */
export async function runIngest(args: IngestArgs, io: IngestIo): Promise<number> {
  if (args.help) {
    io.out(USAGE)
    return 0
  }

  const root = resolve(io.cwd, args.path)
  if (!(await isDirectory(root))) {
    io.err(`no such directory: ${args.path}`)
    return 2
  }

  const repo = args.project ? null : detectRepo(root)
  if (!args.project && !repo) {
    // Falling back to the folder name would merge two different `docs/` folders
    // into one project and let the second silently overwrite the first.
    io.err(`not a git repository: pass --project <name> to name this folder's project`)
    return 2
  }

  const key = args.project ? { project: args.project } : { repo: repo as string }
  const label = args.project ?? (repo as string)

  const walk = await selectFiles(root, { all: args.all })
  const skipped: Skip[] = [...walk.skipped]

  // Read before deciding: the server caps the decoded body, and a Latin-1 file
  // can pass the byte check on disk and still exceed it once decoded.
  const prepared: Prepared[] = []
  for (const file of walk.files) {
    try {
      const body = await readFile(join(root, file.path), 'utf8')
      const bytes = Buffer.byteLength(body, 'utf8')
      if (bytes > MAX_BODY_BYTES) {
        skipped.push({ path: file.path, reason: `too large (${bytes} bytes)` })
        continue
      }
      prepared.push({ path: file.path, body, bytes })
    } catch (error) {
      skipped.push({ path: file.path, reason: (error as Error).message })
    }
  }

  const batches = batchFiles(prepared)
  const totalBytes = prepared.reduce((sum, file) => sum + file.bytes, 0)

  if (args.dryRun) {
    io.out(`would import ${prepared.length} files (${totalBytes} bytes) into ${label} as import/<path>`)
    for (const file of skipped) io.err(`skipped ${file.path}: ${file.reason}`)
    if (walk.truncated) {
      io.err(`the folder tree was larger than the walk limit; the list above is incomplete`)
      return 1
    }
    return 0
  }

  let imported = 0
  let failed = 0

  for (const [index, batch] of batches.entries()) {
    const result = await callTool(
      'memory_ingest',
      {
        ...key,
        path_prefix: 'import',
        files: batch.files.map((file) => ({ path: file.path, body: file.body })),
      },
      { url: args.url, token: args.token, timeoutMs: 60_000 },
    )
    if (!result.ok) {
      failed++
      io.err(`batch ${index + 1} failed: ${result.error}`)
      continue
    }

    const outcome = result.result as { written?: number; skipped?: Skip[] }
    imported += outcome.written ?? batch.files.length
    for (const entry of outcome.skipped ?? []) {
      skipped.push({ path: entry.path, reason: entry.reason })
    }
  }

  for (const file of skipped) io.err(`skipped ${file.path}: ${file.reason}`)
  io.out(`imported ${imported} files, skipped ${skipped.length}`)
  if (walk.truncated) {
    io.err(`the folder tree was larger than the walk limit; not everything was considered`)
  }
  return failed > 0 || skipped.length > 0 || walk.truncated ? 1 : 0
}

/** One place for a readable failure: the message, then exit code 1. */
function failed(io: IngestIo, message: string): number {
  io.err(message)
  return 1
}

async function projectSlugs(args: { url?: string; token?: string }): Promise<string[]> {
  const listed = await callTool('project_list', {}, { url: args.url, token: args.token, timeoutMs: 5000 })
  if (!listed.ok || !Array.isArray(listed.result)) return []
  return listed.result
    .map((row) => {
      const slug = (row as { slug?: unknown } | null)?.slug
      return typeof slug === 'string' ? slug : null
    })
    .filter((slug): slug is string => slug !== null)
}

/** A bare "not found" is useless when the answer is one flag away. */
async function askWhichProject(io: IngestIo, args: { url?: string; token?: string }): Promise<number> {
  const available = await projectSlugs(args)
  io.err('Pick one of:')
  if (available.length === 0) io.err('  (no projects yet, so write one memory first)')
  for (const slug of available) io.err(`  ${slug}`)
  io.err('then pass --project <name>')
  return 1
}

export async function runSearch(args: SearchArgs, io: IngestIo): Promise<number> {
  if (args.help) {
    io.out(USAGE)
    return 0
  }
  if (args.query.trim() === '') {
    return failed(io, 'pass a query, for example: mimir search "rotate the keys"')
  }

  const response = await callRoute('/api/v1/search', {
    method: 'POST',
    body: {
      query: args.query,
      ...(args.project ? { project: args.project } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
    },
    url: args.url,
    token: args.token,
  })
  if (!response.ok) return failed(io, response.error)

  let hits: Array<{ path?: unknown; title?: unknown; projectSlug?: unknown }>
  try {
    const parsed = JSON.parse(response.body) as { results?: unknown }
    hits = Array.isArray(parsed.results) ? (parsed.results as typeof hits) : []
  } catch {
    return failed(io, 'mimir answered something that was not search results')
  }

  if (hits.length === 0) {
    io.out('Nothing matches that in Mimir.')
    return 0
  }

  for (const hit of hits) {
    const path = typeof hit.path === 'string' ? hit.path : ''
    const title = typeof hit.title === 'string' ? hit.title : ''
    // Without --project the same path can exist in several projects, so the
    // line has to say which one it came from.
    const where = args.project
      ? path
      : `${typeof hit.projectSlug === 'string' ? hit.projectSlug : '?'}: ${path}`
    io.out(title ? `${where} - ${title}` : where)
  }
  return 0
}

export async function runExport(args: ExportArgs, io: IngestIo): Promise<number> {
  if (args.help) {
    io.out(USAGE)
    return 0
  }
  if (!args.project) {
    io.err('export needs a project: the file is named after it')
    return askWhichProject(io, args)
  }

  const response = await callRoute(`/api/v1/projects/${encodeURIComponent(args.project)}/export`, {
    url: args.url,
    token: args.token,
  })
  if (!response.ok) return failed(io, response.error)

  const target = args.out ?? `${args.project}.md`
  try {
    await writeFile(resolve(io.cwd, target), response.body, 'utf8')
  } catch (error) {
    return failed(io, (error as Error).message)
  }
  io.out(`${Buffer.byteLength(response.body, 'utf8')} bytes written to ${target}`)
  return 0
}

export async function main(argv: string[]): Promise<void> {
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error((error as Error).message)
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const io: IngestIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    cwd: process.cwd(),
  }

  if (args.command === 'search') process.exitCode = await runSearch(args, io)
  else if (args.command === 'export') process.exitCode = await runExport(args, io)
  else process.exitCode = await runIngest(args as IngestArgs, io)
}
