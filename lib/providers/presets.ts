export type ProviderKind = 'llm' | 'embedding'

export type PresetId =
  | 'deepseek'
  | 'opencode_go'
  | 'opencode_console'
  | 'ollama'
  | 'octen'
  | 'mistral'
  | 'openai_compatible'

export type PresetModel = {
  id: string
  /** Shown after the id, for a list whose entries need a price. */
  label?: string
  /** USD per million tokens, as the provider lists them. Used to seed a row. */
  price?: { input: number; output?: number }
}

export type Preset = {
  label: string
  /** Everything before `/v1`: the client appends `/v1/chat/completions` etc. */
  baseUrl: string
  kinds: ProviderKind[]
  defaultModel: string
  defaultDim?: number
  /**
   * A catalogue that never changes, such as the two DeepSeek models. Per kind,
   * because a preset can do both and no single list fits both.
   */
  models?: Partial<Record<ProviderKind, PresetModel[]>>
  /** A public list fetched at page load; it is not below `baseUrl`. */
  modelsUrl?: string
}

export const PRESETS: Record<PresetId, Preset> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    kinds: ['llm'],
    defaultModel: 'deepseek-flash',
    models: {
      // Off-peak list prices; peak hours are double.
      llm: [
        { id: 'deepseek-flash', price: { input: 0.15, output: 0.6 } },
        { id: 'deepseek-v4-pro', price: { input: 0.66, output: 1.98 } },
      ],
    },
  },
  opencode_go: {
    label: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/inference/go/openai',
    kinds: ['llm'],
    defaultModel: 'deepseek-v4.1-flash',
    modelsUrl: 'https://opencode.ai/inference/v1/models',
  },
  opencode_console: {
    label: 'OpenCode Console',
    baseUrl: 'https://opencode.ai/inference/openai',
    kinds: ['llm'],
    defaultModel: 'deepseek-v4.1-flash',
    modelsUrl: 'https://opencode.ai/inference/v1/models',
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://host.docker.internal:11434',
    kinds: ['llm', 'embedding'],
    defaultModel: 'nomic-embed-text',
    defaultDim: 768,
  },
  octen: {
    label: 'Octen',
    baseUrl: 'https://api.octen.ai',
    kinds: ['embedding'],
    defaultModel: 'octen-embedding-4b',
    defaultDim: 768,
    models: {
      embedding: [
        { id: 'octen-embedding-0.6b', price: { input: 0.01 } },
        { id: 'octen-embedding-4b', price: { input: 0.04 } },
        { id: 'octen-embedding-8b', price: { input: 0.07 } },
      ],
    },
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai',
    kinds: ['llm', 'embedding'],
    defaultModel: 'mistral-small-latest',
    defaultDim: 768,
    models: {
      llm: [
        { id: 'mistral-large-latest', price: { input: 1.36, output: 4.18 } },
        { id: 'mistral-medium-latest', price: { input: 1.5, output: 7.5 } },
        { id: 'mistral-small-latest', price: { input: 0.15, output: 0.6 } },
        { id: 'codestral-latest', price: { input: 0.3, output: 0.9 } },
      ],
      // mistral-embed is fixed at 1024 dimensions, so it cannot fill vector(768).
      embedding: [{ id: 'codestral-embed', price: { input: 0.15 } }],
    },
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
