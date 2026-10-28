import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

export type CallResult = { ok: true; result: unknown } | { ok: false; error: string }

export type CallOptions = {
  url?: string
  token?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export type MimirConfig = { url: string; token: string }

const TOKEN_FILE = '~/.omp/mimir-token'

/**
 * Environment first, then the token file. Anything missing means "stay quiet":
 * a plugin must never break a session it cannot reach Mimir from.
 */
export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): MimirConfig | null {
  const url = text(env.MIMIR_URL)?.replace(/\/+$/, '').replace(/\/mcp$/, '')
  const token = text(env.MIMIR_TOKEN) ?? readTokenFile(text(env.MIMIR_TOKEN_FILE), readFile)
  if (!url || !token) return null
  return { url, token }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readTokenFile(path: string | undefined, readFile: (path: string) => string): string | undefined {
  try {
    // readFileSync does not expand `~`, and every example we print uses one.
    return text(readFile((path ?? TOKEN_FILE).replace(/^~(?=$|\/)/, homedir())))
  } catch {
    return undefined
  }
}

/** Calls one Mimir MCP tool. Never throws: a missing memory server is not an error. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  options: CallOptions = {},
): Promise<CallResult> {
  const url = (options.url ?? process.env.MIMIR_URL ?? '').replace(/\/+$/, '')
  const token = options.token ?? process.env.MIMIR_TOKEN ?? ''
  if (!url || !token) return { ok: false, error: 'MIMIR_URL and MIMIR_TOKEN must be set' }

  try {
    const response = await (options.fetch ?? fetch)(`${url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    })

    if (!response.ok) return { ok: false, error: `mimir responded ${response.status}` }

    const body = (await response.json()) as {
      error?: { message?: string }
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
    }

    if (body.error) return { ok: false, error: body.error.message ?? 'mimir returned an error' }

    const text = body.result?.content?.[0]?.text
    if (body.result?.isError) return { ok: false, error: text ?? 'mimir returned an error' }
    if (!text) return { ok: true, result: body.result ?? null }

    try {
      return { ok: true, result: JSON.parse(text) }
    } catch {
      return { ok: true, result: text }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'request failed' }
  }
}

/** A repo key for the `repo` argument, from MIMIR_REPO or `git remote get-url origin`. */
export function detectRepo(directory: string): string | null {
  if (process.env.MIMIR_REPO) return process.env.MIMIR_REPO
  try {
    const remote = execFileSync('git', ['-C', directory, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return remote || null
  } catch {
    return null
  }
}
