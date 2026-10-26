import { expect, test } from 'vitest'

import { availableModels } from './models'
import { PRESETS } from './presets'

test('a preset with a fixed list needs no network', async () => {
  const models = await availableModels('deepseek')
  expect(models.map((m) => m.id)).toEqual(['deepseek-flash', 'deepseek-v4-pro'])
  expect(PRESETS.deepseek.defaultModel).toBe('deepseek-flash')
})

test('octen offers its three models, with prices', async () => {
  const models = await availableModels('octen')
  expect(models.map((m) => m.id)).toEqual([
    'octen-embedding-0.6b',
    'octen-embedding-4b',
    'octen-embedding-8b',
  ])
  expect(models[1]?.label).toContain('$0.04')
  expect(PRESETS.octen.defaultModel).toBe('octen-embedding-4b')
})

test('a public catalogue is fetched once an hour and mapped to ids', async () => {
  let seen: RequestInit | undefined
  const fake = (async (_url: string, init: RequestInit) => {
    seen = init
    return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }, {}] }))
  }) as unknown as typeof fetch

  const models = await availableModels('opencode_go', { fetch: fake as typeof fetch })

  expect(models).toEqual([{ id: 'model-a' }, { id: 'model-b' }])
  expect(seen?.next).toEqual({ revalidate: 3600 })
})

test('a broken catalogue falls back to an empty list', async () => {
  const fake = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch
  expect(await availableModels('opencode_console', { fetch: fake })).toEqual([])

  const offline = (async () => {
    throw new Error('offline')
  }) as unknown as typeof fetch
  expect(await availableModels('opencode_console', { fetch: offline })).toEqual([])
})

test('a preset with no list and no catalogue offers nothing', async () => {
  expect(await availableModels('ollama')).toEqual([])
})
