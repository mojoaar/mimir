import type { PresetId } from './presets'
import pkg from '../../package.json'

export type ProviderTarget = {
  id: string
  preset: PresetId
  baseUrl: string
  model: string
  apiKey: string | null
}

export type ClientDeps = { fetch?: typeof fetch; timeoutMs?: number }

export class ProviderError extends Error {
  readonly code = 'provider_error'
  readonly status?: number
  /** Lets a caller tell "the provider is broken" from "this one reply was useless". */
  readonly detail?: 'empty_completion'

  constructor(message: string, status?: number, detail?: 'empty_completion') {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.detail = detail
  }
}

const DEFAULT_TIMEOUT_MS = 10_000
const IDENTIFYING_PRESETS: PresetId[] = ['opencode_go', 'opencode_console']

function headersFor(target: ProviderTarget): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`
  // OpenCode's terms ask clients to name themselves and keep a stable session id.
  if (IDENTIFYING_PRESETS.includes(target.preset)) {
    headers['x-opencode-session'] = `mimir-${target.id}`
    headers['user-agent'] = `mimir/${pkg.version}`
  }
  return headers
}

async function request(target: ProviderTarget, path: string, body: unknown, deps: ClientDeps | undefined): Promise<unknown> {
  const doFetch = deps?.fetch ?? fetch
  const response = await doFetch(`${target.baseUrl}${path}`, {
    method: 'POST',
    headers: headersFor(target),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    // A public endpoint must not be able to redirect the server into the network.
    redirect: 'manual',
  })
  // The body can echo the prompt, so it never reaches the message or the audit log.
  if (!response.ok) throw new ProviderError(`provider responded ${response.status}`, response.status)
  return response.json()
}

export async function chatComplete(
  target: ProviderTarget,
  messages: { role: 'system' | 'user'; content: string }[],
  deps?: ClientDeps,
): Promise<string> {
  const json = (await request(target, '/v1/chat/completions', { model: target.model, messages }, deps)) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content === '') {
    throw new ProviderError('empty completion', undefined, 'empty_completion')
  }
  return content
}

export async function embed(target: ProviderTarget, input: string[], deps?: ClientDeps): Promise<number[][]> {
  const json = (await request(target, '/v1/embeddings', { model: target.model, input }, deps)) as {
    data?: { embedding?: number[] }[]
  }
  const vectors = (json.data ?? []).map((row) => row.embedding)
  if (vectors.length !== input.length || vectors.some((v) => !Array.isArray(v))) {
    throw new ProviderError('embedding count did not match the input')
  }
  return vectors as number[][]
}

export async function listModels(target: ProviderTarget, deps?: ClientDeps): Promise<string[]> {
  const doFetch = deps?.fetch ?? fetch
  const response = await doFetch(`${target.baseUrl}/v1/models`, {
    method: 'GET',
    headers: headersFor(target),
    signal: AbortSignal.timeout(deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    // A public endpoint must not be able to redirect the server into the network.
    redirect: 'manual',
  })
  if (!response.ok) throw new ProviderError(`provider responded ${response.status}`, response.status)
  const json = (await response.json()) as { data?: { id?: string }[] }
  return (json.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === 'string')
}
