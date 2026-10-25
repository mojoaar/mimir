#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parseArgs, type IngestArgs } from './args.js'
import { batchFiles } from './batch.js'
import { callTool, detectRepo } from './client.js'
import { selectFiles } from './select.js'

const USAGE = `mimir ingest — load a project's documentation into Mimir

  mimir ingest [path] [options]

  --project <name>  name the project yourself (required for a folder that is
                    not a git repository, or to keep two folders apart)
  --url <url>       Mimir base URL (default: MIRIM_URL)
  --token <token>   API key (default: MIMIR_TOKEN)
  --all             import every text file, not just documentation
  --dry-run         print what would be sent and send nothing

Imports land under import/ in the project, where memory_search finds them.`

export type IngestIo = {
  out: (line: string) => void
  err: (line: string) => void
  cwd: string
}

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
  const key = args.project ? { project: args.project } : repo ? { repo } : { project: basename(root) }
  const label = args.project ?? repo ?? basename(root)

  const { files, skipped } = await selectFiles(root, { all: args.all })
  const batches = batchFiles(files)
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)

  if (args.dryRun) {
    io.out(`would import ${files.length} files (${totalBytes} bytes) into ${label} as import/<path>`)
    for (const file of skipped) io.err(`skipped ${file.path}: ${file.reason}`)
    return 0
  }

  let imported = 0
  let failed = 0

  for (const [index, batch] of batches.entries()) {
    const payload: { path: string; body: string }[] = []
    for (const file of batch.files) {
      try {
        payload.push({ path: file.path, body: await readFile(join(root, file.path), 'utf8') })
      } catch (error) {
        skipped.push({ path: file.path, reason: (error as Error).message })
      }
    }
    if (payload.length === 0) continue

    const result = await callTool(
      'memory_ingest',
      { ...key, path_prefix: 'import', files: payload },
      { timeoutMs: 60_000 },
    )
    if (!result.ok) {
      failed++
      io.err(`batch ${index + 1} failed: ${result.error}`)
      continue
    }

    const outcome = result.result as { written?: number; skipped?: string[] }
    imported += outcome.written ?? payload.length
    for (const path of outcome.skipped ?? []) {
      skipped.push({ path, reason: 'refused by the server' })
    }
  }

  for (const file of skipped) io.err(`skipped ${file.path}: ${file.reason}`)
  io.out(`imported ${imported} files, skipped ${skipped.length}`)
  return failed > 0 || skipped.length > 0 ? 1 : 0
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

if (process.argv[1]?.endsWith('cli.js')) {
  void main(process.argv.slice(2))
}
