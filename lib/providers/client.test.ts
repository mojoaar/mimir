import { expect, test } from 'vitest'

import pkg from '../../package.json'
import { chatComplete, embed, type ProviderTarget } from './client'

const target: ProviderTarget = {
  id: 'p1',
  preset: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'k',
}

test('posts to /v1/chat/completions and returns the message', async () => {
  const seen: string[] = []
  const fake = (async (url: string, init: RequestInit) => {
    seen.push(String(url))
    expect(init.headers).toMatchObject({ authorization: 'Bearer k' })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 })
  }) as unknown as typeof fetch

  expect(await chatComplete(target, [{ role: 'user', content: 'hi' }], { fetch: fake })).toBe('hello')
  expect(seen).toEqual(['https://api.deepseek.com/v1/chat/completions'])
})

test('an opencode go call identifies itself', async () => {
  const go = { ...target, preset: 'opencode_go' as const, baseUrl: 'https://opencode.ai/inference/go/openai' }
  const fake = (async (_url: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ 'x-opencode-session': 'mimir-p1', 'user-agent': `mimir/${pkg.version}` })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  }) as unknown as typeof fetch

  await chatComplete(go, [{ role: 'user', content: 'hi' }], { fetch: fake })
})

test('a 500 becomes ProviderError carrying the status', async () => {
  const fake = (async () => new Response('upstream boom', { status: 500 })) as unknown as typeof fetch

  await expect(chatComplete(target, [{ role: 'user', content: 'hi' }], { fetch: fake })).rejects.toMatchObject({
    code: 'provider_error',
    status: 500,
  })
})

test('embeddings return one array per input', async () => {
  const fake = (async () =>
    new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }))) as unknown as typeof fetch

  expect(await embed(target, ['a', 'b'], { fetch: fake })).toEqual([
    [0.1, 0.2],
    [0.3, 0.4],
  ])
})
