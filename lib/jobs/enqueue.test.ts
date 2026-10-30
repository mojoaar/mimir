import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn())
vi.mock('./boss', () => ({ sendJob: send }))

const { enqueueEmbeddingRebuild } = await import('./enqueue')

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue('job-1')
})

describe('the embedding rebuild queue', () => {
  it('rebuilds every vector when the model changed', async () => {
    expect(await enqueueEmbeddingRebuild(true)).toBe(true)
    expect(send).toHaveBeenCalledWith('reembed', { confirm: true })
  })

  it('fills gaps only when the model is the same', async () => {
    expect(await enqueueEmbeddingRebuild(false)).toBe(true)
    expect(send).toHaveBeenCalledWith('backfill', {})
  })

  it('says the queue is down instead of letting vectors be cleared', async () => {
    send.mockResolvedValue(null)
    expect(await enqueueEmbeddingRebuild(true)).toBe(false)
  })
})
