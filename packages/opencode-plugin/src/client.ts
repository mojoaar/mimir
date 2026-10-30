import { execFileSync } from 'node:child_process'
export type CallResult = { ok: true; result: unknown } | { ok: false; error: string }

export type RouteResult = { ok: true; body: string } | { ok: false; error: string }

export type CallOptions = {
  url?: string
  token?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

/**
 * Calls one Mimir MCP tool. Never throws: a plugin must not break a session
 * because the memory server is down.
 */
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

/** A repo key for X-Mimir-Repo, from MIMIR_REPO or `git remote get-url origin`. */
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

/**
 * Calls one of the REST routes, for the CLI commands that need a whole file
 * rather than a tool result. Same fail-soft contract as callTool.
 */
export async function callRoute(
  path: string,
  options: CallOptions & { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<RouteResult> {
  const url = (options.url ?? process.env.MIMIR_URL ?? '').replace(/\/+$/, '')
  const token = options.token ?? process.env.MIMIR_TOKEN ?? ''
  if (!url || !token) return { ok: false, error: 'MIMIR_URL and MIMIR_TOKEN must be set' }

  try {
    const response = await (options.fetch ?? fetch)(`${url}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        authorization: `Bearer ${token}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })

    const text = await response.text()
    if (!response.ok) {
      // The API answers { error, code }; a proxy may answer HTML. Prefer the
      // sentence when there is one, never a stack trace.
      let message = `mimir responded ${response.status}`
      try {
        const parsed = JSON.parse(text) as { error?: unknown }
        if (typeof parsed.error === 'string') message = parsed.error
      } catch {
        // keep the status line
      }
      return { ok: false, error: message }
    }
    return { ok: true, body: text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'request failed' }
  }
}
