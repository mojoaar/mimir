import { expect, test } from 'vitest'
import { PRESETS } from './presets'

test('every preset base URL is usable by the client suffix rule', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    if (id === 'openai_compatible') continue
    expect(preset.baseUrl).not.toMatch(/\/v1$/)
    expect(preset.baseUrl.startsWith('http')).toBe(true)
  }
})

test('opencode go uses the openai sub-path, not the bare inference root', () => {
  expect(PRESETS.opencode_go.baseUrl).toBe('https://opencode.ai/inference/go/openai')
})

test('deepseek offers the two current models, flash by default, with their prices', () => {
  expect(PRESETS.deepseek.defaultModel).toBe('deepseek-flash')
  expect(PRESETS.deepseek.models?.llm?.map((m) => m.id)).toEqual([
    'deepseek-flash',
    'deepseek-v4-pro',
  ])
  expect(PRESETS.deepseek.models?.llm?.[0]?.price).toEqual({ input: 0.15, output: 0.6 })
})

test('octen is an embedding-only preset that fits the stored dimension', () => {
  expect(PRESETS.octen.kinds).toEqual(['embedding'])
  expect(PRESETS.octen.defaultDim).toBe(768)
  expect(PRESETS.octen.models?.embedding).toHaveLength(3)
  expect(PRESETS.octen.models?.embedding?.[1]?.price).toEqual({ input: 0.04 })
})

test('mistral offers chat models and the one embedder that can fit 768', () => {
  expect(PRESETS.mistral.kinds).toEqual(['llm', 'embedding'])
  expect(PRESETS.mistral.defaultModel).toBe('mistral-small-latest')
  expect(PRESETS.mistral.defaultDim).toBe(768)
  expect(PRESETS.mistral.models?.llm?.map((m) => m.id)).toEqual([
    'mistral-large-latest',
    'mistral-medium-latest',
    'mistral-small-latest',
    'codestral-latest',
  ])
  // mistral-embed is fixed at 1024 dimensions and must not be offered.
  expect(PRESETS.mistral.models?.embedding).toEqual([
    { id: 'codestral-embed', price: { input: 0.15 } },
  ])
})
