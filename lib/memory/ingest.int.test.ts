import { beforeEach, describe, expect, it } from 'vitest'
import { Fixtures, resetFixtures, seedTwoUsersWithProjects } from '../db/seed'
import { ingestFiles, MAX_INGEST_BYTES, MAX_INGEST_FILES, type IngestFile } from './ingest'
import { readMemory } from './service'
import { searchMemories } from './search'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

const file = (path: string, body = 'body') => ({ path, body })

describe('ingestFiles', () => {
  it('writes files under the import prefix', async () => {
    const result = await ingestFiles({
      userId: f.alice,
      projectId: f.aliceProjectId,
      files: [file('docs/readme.md'), file('src/index.ts'), file('README.md')],
    })

    expect(result).toEqual({ written: 3, skipped: [] })
    const read = await readMemory(f.alice, f.aliceProjectId, 'import/docs/readme.md')
    expect(read?.body).toBe('body')
    expect(read?.kind).toBe('import')
  })

  it('skips a path that tries to escape the project', async () => {
    const result = await ingestFiles({
      userId: f.alice,
      projectId: f.aliceProjectId,
      files: [file('ok/one'), file('../etc/passwd'), file('ok/two')],
    })

    expect(result.written).toBe(2)
    expect(result.skipped.map((s) => s.path)).toEqual(['../etc/passwd'])
    expect(result.skipped[0]?.reason).toContain('invalid_path')
    expect(await readMemory(f.alice, f.aliceProjectId, 'import/ok/one')).not.toBeNull()
  })

  it('refuses a batch with too many files without writing any', async () => {
    const files = Array.from({ length: MAX_INGEST_FILES + 1 }, (_, i) => file(`f/${i}`))

    await expect(
      ingestFiles({ userId: f.alice, projectId: f.aliceProjectId, files }),
    ).rejects.toMatchObject({ code: 'invalid_params' })

    const hits = await searchMemories({
      userId: f.alice,
      projectId: f.aliceProjectId,
      query: 'body',
    })
    expect(hits).toHaveLength(0)
  })

  it('refuses a batch that is too large without writing any', async () => {
    const big = 'x'.repeat(MAX_INGEST_BYTES)

    await expect(
      ingestFiles({
        userId: f.alice,
        projectId: f.aliceProjectId,
        files: [file('big/one', big), file('big/two', big)],
      }),
    ).rejects.toMatchObject({ code: 'invalid_params' })
  })

  it('refuses the whole batch when one file is over the per-memory limit', async () => {
    await expect(
      ingestFiles({
        userId: f.alice,
        projectId: f.aliceProjectId,
        files: [file('big/one', 'x'.repeat(300 * 1024)), file('small/two', 'ok')],
      }),
    ).rejects.toMatchObject({ code: 'invalid_params' })

    expect(await readMemory(f.alice, f.aliceProjectId, 'import/small/two')).toBeNull()
  })

  it('refuses a file without a string body instead of writing part of the batch', async () => {
    await expect(
      ingestFiles({
        userId: f.alice,
        projectId: f.aliceProjectId,
        files: [{ path: 'no-body' } as unknown as IngestFile],
      }),
    ).rejects.toMatchObject({ code: 'invalid_params' })
  })

  it('keeps the last body when one path repeats in a batch', async () => {
    const result = await ingestFiles({
      userId: f.alice,
      projectId: f.aliceProjectId,
      files: [file('dup', 'first'), file('dup', 'second')],
    })

    expect(result.written).toBe(2)
    const read = await readMemory(f.alice, f.aliceProjectId, 'import/dup')
    expect(read?.body).toBe('second')
  })

  it('refuses a caller who can only read', async () => {
    await expect(
      ingestFiles({ userId: f.bob, projectId: f.aliceProjectId, files: [file('x')] }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('leaves one memory when two ingests race on the same path', async () => {
    const run = (body: string) =>
      ingestFiles({
        userId: f.alice,
        projectId: f.aliceProjectId,
        files: [file('race', body)],
      })

    await Promise.all([run('left'), run('right')])

    const hits = await searchMemories({
      userId: f.alice,
      projectId: f.aliceProjectId,
      query: 'left',
      pathPrefix: 'import',
    })
    const other = await searchMemories({
      userId: f.alice,
      projectId: f.aliceProjectId,
      query: 'right',
      pathPrefix: 'import',
    })
    expect(hits.length + other.length).toBe(1)
  })
})
