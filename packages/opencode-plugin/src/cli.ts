#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parseArgs, type IngestArgs } from './args.js'
import { batchFiles } from './batch.js'
import { callTool, detectRepo } from './client.js'
import { selectFiles } from './select.js'

const USAGE = `mimir ingest — load a project's documentation into Mimir

  mimir ingest [path] [options]

  --project <name>  name the project yourself. Required for a folder that is
                    not a git repository; also keeps two folders apart.
  --url <url>       Mimir base URL (default: MIMIR_URL)
  --token <token>   API key (default: MIMIR_TOKEN)
  --all             import every text file, not just documentation
  --dry-run         print what would be sent and send nothing

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

export async function main(argv: string[]): Promise<void> {
  let args: IngestArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error((error as Error).message)
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  process.exitCode = await runIngest(args, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    cwd: process.cwd(),
  })
}
