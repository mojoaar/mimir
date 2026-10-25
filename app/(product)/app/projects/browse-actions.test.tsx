import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeMemory: vi.fn(async () => ({ path: 'a/b', created: true })),
  deleteMemory: vi.fn(async () => true),
  restoreMemory: vi.fn(async () => ({ restored: true as const })),
  audit: vi.fn(async () => {}),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/context', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/audit', () => ({
  describeAuditFailure: (error: unknown) => (error instanceof Error ? error.message : 'unknown'), audit: mocks.audit }))
vi.mock('@/lib/memory/service', () => ({
  writeMemory: mocks.writeMemory,
  deleteMemory: mocks.deleteMemory,
  restoreMemory: mocks.restoreMemory,
  listDeletedMemories: vi.fn(async () => []),
  treeMemory: vi.fn(async () => []),
  readMemory: vi.fn(async () => null),
}))

import { deleteMemoryAction, restoreMemoryAction, saveMemoryAction } from './[slug]/actions'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe('browser actions', () => {
  it('saves the body and records one audit row', async () => {
    const state = await saveMemoryAction({}, form({ projectId: 'p1', slug: 'demo', path: 'a/b', body: 'text' }))

    expect(state).toEqual({ ok: 'Saved.' })
    expect(mocks.writeMemory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', projectId: 'p1', path: 'a/b', body: 'text', source: 'web' }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'memory.write', targetId: 'a/b' }))
  })

  it('returns the service message for a rejected body instead of a 500', async () => {
    mocks.writeMemory.mockRejectedValueOnce(Object.assign(new Error('body_too_large: 300000'), { code: 'body_too_large' }))
    const state = await saveMemoryAction({}, form({ projectId: 'p1', slug: 'demo', path: 'a/b', body: 'x' }))
    expect(state).toEqual({ error: 'That is larger than this server accepts.' })
  })

  it('deletes, audits and lands on the bin', async () => {
    await expect(deleteMemoryAction(form({ projectId: 'p1', slug: 'demo', path: 'a/b' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'memory.delete', targetId: 'a/b' }))
    expect(mocks.redirect).toHaveBeenCalledWith('/app/projects/demo?deleted=1')
  })

  it('says why a restore was refused instead of landing silently', async () => {
    mocks.restoreMemory.mockResolvedValueOnce({ restored: false, reason: 'conflict' } as never)

    await expect(restoreMemoryAction(form({ projectId: 'p1', slug: 'demo', path: 'a/b' }))).rejects.toThrow('NEXT_REDIRECT')

    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('deleted=1&error='))
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('written%20again'))
  })

  it('does not audit a delete that found nothing', async () => {
    mocks.deleteMemory.mockResolvedValueOnce(false)

    await expect(deleteMemoryAction(form({ projectId: 'p1', slug: 'demo', path: 'a/b' }))).rejects.toThrow('NEXT_REDIRECT')

    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('restores and opens the memory', async () => {
    await expect(restoreMemoryAction(form({ projectId: 'p1', slug: 'demo', path: 'a/b' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'memory.restore' }))
    expect(mocks.redirect).toHaveBeenCalledWith('/app/projects/demo?path=a%2Fb')
  })
})
