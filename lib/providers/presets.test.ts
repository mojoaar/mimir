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
