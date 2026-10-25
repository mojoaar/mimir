import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('hooks/mimir-session-start.sh')

type Run = { stdout: string; status: number; calls: string[] }

// Runs the script with a fake curl first on PATH, so the test proves the exact
// request without a server.
function run(env: Record<string, string>, curlExit = 0, curlBody = 'DIGEST'): Run {
  const dir = mkdtempSync(join(tmpdir(), 'mimir-hook-'))
  const calls = join(dir, 'calls')
  const body = join(dir, 'body')
  writeFileSync(body, curlBody)
  writeFileSync(
    join(dir, 'curl'),
    `#!/bin/sh\nprintf '%s\\n' "$@" >> ${calls}\ncat ${body}\nexit ${curlExit}\n`,
  )
  chmodSync(join(dir, 'curl'), 0o755)
  chmodSync(script, 0o755)

  let stdout = ''
  let status = 0
  try {
    stdout = execFileSync('sh', [script], {
      env: { ...process.env, ...env, PATH: `${dir}:${process.env.PATH ?? ''}` },
      encoding: 'utf8',
    })
  } catch (error) {
    const failed = error as { status?: number; stdout?: string }
    stdout = failed.stdout ?? ''
    status = failed.status ?? 1
  }

  let recorded: string[] = []
  try {
    recorded = readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    recorded = []
  }

  return { stdout: stdout.trim(), status, calls: recorded }
}

describe('mimir-session-start.sh', () => {
  it('requests the digest and prints the body', () => {
    const result = run({ MIMIR_URL: 'https://m.test/', MIMIR_TOKEN: 'k', MIMIR_PROJECT: 'p' })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('DIGEST')
    expect(result.calls.join(' ')).toContain(
      'https://m.test/api/v1/projects/p/digest?budget_tokens=800&format=text',
    )
    expect(result.calls.join(' ')).toContain('Authorization: Bearer k')
  })

  it('does nothing without a project', () => {
    const result = run({ MIMIR_URL: 'https://m.test', MIMIR_TOKEN: 'k' })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.calls).toEqual([])
  })

  it('stays silent when the request times out', () => {
    const result = run({ MIMIR_URL: 'https://m.test', MIMIR_TOKEN: 'k', MIMIR_PROJECT: 'p' }, 28, '')

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('is a parseable executable script', () => {
    execFileSync('sh', ['-n', script])
    expect(readFileSync(script, 'utf8').startsWith('#!/bin/sh')).toBe(true)
  })
})
