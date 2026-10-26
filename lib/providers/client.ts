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

/** Octen asks whether a text is a query or a document; the prompt differs. */
export type EmbedDeps = ClientDeps & {
  dimension?: number
  inputType?: 'query' | 'document'
}

/** The schema stores vector(768), so that is what a provider must answer with. */
const DEFAULT_DIMENSION = 768

/**
 * OpenAI calls the field `dimensions`; Mistral's embedding model calls it
 * `output_dimension`. Both truncate to the first N values.
 */
const DIMENSION_FIELD: Partial<Record<PresetId, string>> = { mistral: 'output_dimension' }

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

export async function embed(
  target: ProviderTarget,
  input: string[],
  deps?: EmbedDeps,
): Promise<number[][]> {
  const dimension = deps?.dimension ?? DEFAULT_DIMENSION

  // Octen is not OpenAI-shaped: another path, a `results` array and a dimension
  // that must be named, since its models answer at 1024 or more otherwise.
  if (target.preset === 'octen') {
    const json = (await request(
      target,
      '/embedding',
      {
        model: target.model,
        input,
        dimension,
        input_type: deps?.inputType ?? 'document',
      },
      deps,
    )) as { data?: { results?: { index?: number; embedding?: number[] }[] } }
    const rows = [...(json.data?.results ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    return vectors(rows.map((row) => row.embedding), input.length)
  }

  const dimensionField = DIMENSION_FIELD[target.preset] ?? 'dimensions'
  const body = { model: target.model, input, [dimensionField]: dimension }
  type EmbedResponse = { data?: { embedding?: number[] }[] }
  let json: EmbedResponse
  try {
    json = (await request(target, '/v1/embeddings', body, deps)) as EmbedResponse
  } catch (error) {
    // Some OpenAI-compatible shims refuse `dimensions` even though the field is
    // standard. One retry without it; anything but a 400 is a real failure.
    if (!(error instanceof ProviderError && error.status === 400)) throw error
    json = (await request(target, '/v1/embeddings', { model: target.model, input }, deps)) as EmbedResponse
  }
  return vectors((json.data ?? []).map((row) => row.embedding), input.length)
}

function vectors(values: (number[] | undefined)[], expected: number): number[][] {
  if (values.length !== expected || values.some((v) => !Array.isArray(v))) {
    throw new ProviderError('embedding count did not match the input')
  }
  return values as number[][]
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
