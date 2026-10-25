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

const run = (day: number) => [
  { key: `mimir-202610${String(day).padStart(2, '0')}-030000.dump.enc`, size: 1 },
  { key: `settings-202610${String(day).padStart(2, '0')}-030000.json.enc`, size: 1 },
]

describe('retention', () => {
  it('keeps the newest restore points and never touches anything else', async () => {
    const keys = [
      ...Array.from({ length: 8 }, (_, i) => run(i + 1)).flat(),
      { key: 'notes.txt', size: 1 },
      { key: 'mimir-manual.dump.enc', size: 1 },
    ]
    const { storage, removed } = storageWith(keys)

    await pruneOldBackups(storage, 'backups', 6)

    expect(removed.sort()).toEqual([
      'mimir-20261001-030000.dump.enc',
      'mimir-20261002-030000.dump.enc',
      'settings-20261001-030000.json.enc',
      'settings-20261002-030000.json.enc',
    ])
  })

  it('removes nothing when there are fewer restore points than the limit', async () => {
    const { storage, removed } = storageWith([
      { key: 'mimir-20261001-030000.dump.enc', size: 1 },
      { key: 'settings-20261001-030000.json.enc', size: 1 },
    ])
    await pruneOldBackups(storage, 'backups', 14)
    expect(removed).toEqual([])
  })

  it('never leaves a run half deleted: both artefacts of an old run go together', async () => {
    const keys = [...Array.from({ length: 15 }, (_, i) => run(i + 1)).flat()]
    const { storage, removed } = storageWith(keys)

    await pruneOldBackups(storage, 'backups', 14)

    expect(removed).toHaveLength(2)
    expect(removed.filter((key) => key.startsWith('mimir-'))).toHaveLength(1)
    expect(removed.filter((key) => key.startsWith('settings-'))).toHaveLength(1)
  })
})
