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

test('an openai-compatible call asks for the stored dimension', async () => {
  let body: unknown
  const fake = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ data: [{ embedding: [1] }] }))
  }) as unknown as typeof fetch

  await embed(target, ['a'], { fetch: fake, dimension: 768 })
  expect(body).toMatchObject({ model: 'deepseek-chat', input: ['a'], dimensions: 768 })
})

test('a provider that refuses dimensions gets one retry without it', async () => {
  const bodies: unknown[] = []
  const fake = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    bodies.push(body)
    if ('dimensions' in body) return new Response('unknown field', { status: 400 })
    return new Response(JSON.stringify({ data: [{ embedding: [1, 2] }] }))
  }) as unknown as typeof fetch

  expect(await embed(target, ['a'], { fetch: fake })).toEqual([[1, 2]])
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).not.toHaveProperty('dimensions')
})

test('a rejected key is not retried', async () => {
  let calls = 0
  const fake = (async () => {
    calls += 1
    return new Response('no', { status: 401 })
  }) as unknown as typeof fetch

  await expect(embed(target, ['a'], { fetch: fake })).rejects.toMatchObject({ status: 401 })
  expect(calls).toBe(1)
})

test('octen uses its own path, shape and input type', async () => {
  const octen = {
    ...target,
    preset: 'octen' as const,
    baseUrl: 'https://api.octen.ai',
    model: 'octen-embedding-4b',
  }
  let seen: { url: string; body: Record<string, unknown> } | undefined
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), body: JSON.parse(String(init.body)) }
    // Out of order on purpose: the client must put index 0 first.
    return new Response(
      JSON.stringify({
        code: 0,
        data: { results: [{ index: 1, embedding: [0.3] }, { index: 0, embedding: [0.1] }] },
      }),
    )
  }) as unknown as typeof fetch

  expect(await embed(octen, ['a', 'b'], { fetch: fake, inputType: 'query' })).toEqual([
    [0.1],
    [0.3],
  ])
  expect(seen?.url).toBe('https://api.octen.ai/embedding')
  expect(seen?.body).toEqual({
    model: 'octen-embedding-4b',
    input: ['a', 'b'],
    dimension: 768,
    input_type: 'query',
  })
})
