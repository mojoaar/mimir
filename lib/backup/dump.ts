import { spawn } from 'node:child_process'

export type DumpRunner = (url: string) => Promise<Buffer>

const STDERR_LIMIT = 300

/** Custom format keeps the dump restorable by `pg_restore` in one pass. */
export function dumpArgs(url: string): string[] {
  return ['-Fc', '--no-owner', '--no-privileges', '--dbname', url]
}

export async function dumpDatabase(url: string, deps: { runner?: DumpRunner } = {}): Promise<Buffer> {
  if (deps.runner) return deps.runner(url)
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('pg_dump', dumpArgs(url), { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => reject(new Error(`pg_dump failed: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`pg_dump failed: ${stderr.trim().slice(0, STDERR_LIMIT)}`))
    })
  })
}
