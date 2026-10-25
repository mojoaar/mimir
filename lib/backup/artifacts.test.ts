import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

vi.mock('@/lib/config', () => ({
  getConfig: () => ({
    secret: 'a'.repeat(64),
    databaseAdminUrl: 'postgres://owner:secret@db:5432/mimir',
  }),
}))

vi.mock('./settings-export', () => ({
  buildSettingsExport: async () => ({ version: 'test', exportedAt: 'x', settings: {}, projects: [], providers: [] }),
}))

/** A fake ChildProcess that records the argv and emits the given exit. */
function fakeChild(options: { code: number; stderr?: string }) {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const child = {
    stderr: { on: (_event: string, cb: (chunk: Buffer) => void) => {
      if (options.stderr) cb(Buffer.from(options.stderr))
    } },
    stdout: { on: (_event: string, _cb: (chunk: Buffer) => void) => {} },
    on: (event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb
      if (event === 'close') setTimeout(() => cb(options.code), 0)
      return child
    },
    kill: () => {},
  }
  return child
}

import { dumpArgs, dumpDatabase } from './dump'
import { buildBackupArtifacts, decryptArtifact } from './artifacts'

describe('pg_dump arguments', () => {
  it('writes a custom-format dump that carries no ownership', () => {
    const args = dumpArgs('postgres://owner:secret@db:5432/mimir')
    expect(args).toContain('-Fc')
    expect(args).toContain('--no-owner')
    expect(args).toContain('postgres://owner:secret@db:5432/mimir')
  })
})

describe('the dump runner', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('throws with the first line of stderr when pg_dump fails', async () => {
    spawnMock.mockReturnValue(fakeChild({ code: 1, stderr: 'pg_dump: error: connection refused\n' }))
    await expect(dumpDatabase('postgres://x')).rejects.toThrow(/pg_dump failed: pg_dump: error: connection refused/)
    expect(spawnMock).toHaveBeenCalledWith('pg_dump', expect.arrayContaining(['-Fc']), expect.anything())
  })

  it('returns the bytes pg_dump writes', async () => {
    const child = fakeChild({ code: 0 })
    const chunks: Buffer[] = []
    child.stdout.on = (_event: string, cb: (chunk: Buffer) => void) => {
      cb(Buffer.from('DUMPDATA'))
      chunks.push(Buffer.from('DUMPDATA'))
    }
    spawnMock.mockReturnValue(child)
    await expect(dumpDatabase('postgres://x')).resolves.toEqual(Buffer.from('DUMPDATA'))
  })
})

describe('backup artifacts', () => {
  it('names both artifacts with a timestamp and encrypts them', async () => {
    const artifacts = await buildBackupArtifacts({
      now: new Date('2026-10-26T03:04:05Z'),
      dump: async () => Buffer.from('PGDUMP-BYTES'),
    })
    expect(artifacts.map((a) => a.name)).toEqual([
      'mimir-20261026-030405.dump.enc',
      'settings-20261026-030405.json.enc',
    ])
    expect(artifacts[0]?.body.includes(Buffer.from('PGDUMP'))).toBe(false)
  })

  it('round-trips binary dump bytes through decryption', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x50, 0x47, 0x44, 0x55, 0x4d, 0x50, 0x00])
    const [dump] = await buildBackupArtifacts({
      now: new Date('2026-10-26T00:00:00Z'),
      dump: async () => binary,
    })
    expect(decryptArtifact(dump!.body)).toEqual(binary)
  })

  it('refuses a tampered artifact', async () => {
    const [dump] = await buildBackupArtifacts({ dump: async () => Buffer.from('PGDUMP') })
    const body = Buffer.from(dump!.body)
    body[body.length - 1] = body[body.length - 1]! ^ 0xff
    expect(() => decryptArtifact(body)).toThrow(/cannot decrypt/)
  })
})
