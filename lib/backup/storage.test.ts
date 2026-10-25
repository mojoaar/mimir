import { describe, expect, it, vi } from 'vitest'
import { pruneOldBackups, type Storage } from './storage'

function storageWith(keys: { key: string; size: number }[]) {
  const removed: string[] = []
  const storage: Storage = {
    put: vi.fn(async () => {}),
    head: vi.fn(async () => null),
    list: vi.fn(async () => keys),
    remove: vi.fn(async (key: string) => {
      removed.push(key)
    }),
  }
  return { storage, removed }
}

describe('retention', () => {
  it('keeps the newest artefacts and never touches anything else', async () => {
    const keys = [
      ...Array.from({ length: 8 }, (_, i) => ({
        key: `mimir-2026100${i + 1}-030000.dump.enc`,
        size: 1,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        key: `settings-2026100${i + 1}-030000.json.enc`,
        size: 1,
      })),
      { key: 'notes.txt', size: 1 },
      { key: 'mimir-manual.dump.enc', size: 1 },
    ]
    const { storage, removed } = storageWith(keys)

    await pruneOldBackups(storage, 'backups', 14)

    expect(removed.sort()).toEqual([
      'mimir-20261001-030000.dump.enc',
      'mimir-20261002-030000.dump.enc',
    ])
    expect(removed).not.toContain('notes.txt')
    expect(removed).not.toContain('mimir-manual.dump.enc')
  })

  it('removes nothing when there are fewer artefacts than the limit', async () => {
    const { storage, removed } = storageWith([{ key: 'mimir-20261001-030000.dump.enc', size: 1 }])
    await pruneOldBackups(storage, 'backups', 14)
    expect(removed).toEqual([])
  })
})
