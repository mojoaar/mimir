export type ProviderKind = 'llm' | 'embedding'

export type PresetId =
  | 'deepseek'
  | 'opencode_go'
  | 'opencode_console'
  | 'ollama'
  | 'openai_compatible'

export type Preset = {
  label: string
  /** Everything before `/v1`: the client appends `/v1/chat/completions` etc. */
  baseUrl: string
  kinds: ProviderKind[]
  defaultModel: string
  defaultDim?: number
}

export const PRESETS: Record<PresetId, Preset> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    kinds: ['llm'],
    defaultModel: 'deepseek-chat',
  },
  opencode_go: {
    label: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/inference/go/openai',
    kinds: ['llm'],
    defaultModel: 'deepseek-v4.1-flash',
  },
  opencode_console: {
    label: 'OpenCode Console',
    baseUrl: 'https://opencode.ai/inference/openai',
    kinds: ['llm'],
    defaultModel: 'deepseek-v4.1-flash',
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://host.docker.internal:11434',
    kinds: ['llm', 'embedding'],
    defaultModel: 'nomic-embed-text',
    defaultDim: 768,
  },
  openai_compatible: {
    label: 'OpenAI-compatible',
    baseUrl: '',
    kinds: ['llm', 'embedding'],
    defaultModel: '',
  },
}

export function presetFor(id: string): Preset {
  if (!Object.hasOwn(PRESETS, id)) {
    const error = new Error(`invalid_params: unknown provider preset '${id}'`) as Error & {
      code: string
    }
    error.code = 'invalid_params'
    throw error
  }
  return PRESETS[id as PresetId]
}
