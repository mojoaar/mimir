import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ToolPolicy = 'auto' | 'always' | 'never'

export type MimirConfig = { url: string; token: string; tools: ToolPolicy }

const DEFAULT_TOKEN_FILE = join(homedir(), '.config/opencode/.secrets/mimir-token')

/**
 * Options win over the environment, which wins over the token file the MCP
 * header already points at. Anything missing means "stay quiet": a plugin
 * must never break a session it cannot reach Mimir from.
 */
export function resolveConfig(
  options: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): MimirConfig | null {
  const url = normaliseUrl(text(options.url) ?? text(env.MIMIR_URL))
  const token =
    text(options.token) ?? text(env.MIMIR_TOKEN) ?? readTokenFile(text(options.tokenFile), readFile)
  if (!url || !token) return null

  const policy = options.tools
  return { url, token, tools: policy === 'always' || policy === 'never' ? policy : 'auto' }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readTokenFile(path: string | undefined, readFile: (path: string) => string): string | undefined {
  try {
    return text(readFile(path ?? DEFAULT_TOKEN_FILE))
  } catch {
    return undefined
  }
}

/** A base URL, because callers append `/mcp` themselves. */
function normaliseUrl(value: string | undefined): string | undefined {
  return text(value?.replace(/\/+$/, '').replace(/\/mcp$/, ''))
}
