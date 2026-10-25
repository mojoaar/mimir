import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { deleteMemory, readMemory, treeMemory, writeMemory } from './service'

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await closePools()
})

describe('memory service', () => {
  it('upserts one path instead of appending', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'conventions/commits', body: 'first' })
    const second = await writeMemory({
      userId: f.alice,
      projectId,
      path: 'conventions/commits',
      body: 'second',
    })
    expect(second.created).toBe(false)
    expect((await readMemory(f.alice, projectId, 'conventions/commits'))!.body).toBe('second')
  })

  it('derives a title from the first line when none is given', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/b', body: '\n\nUse pnpm for workspaces\nmore' })
    expect((await readMemory(f.alice, projectId, 'a/b'))!.title).toBe('Use pnpm for workspaces')
  })

  it('keeps an explicit title', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/c', body: 'body', title: 'Chosen' })
    expect((await readMemory(f.alice, projectId, 'a/c'))!.title).toBe('Chosen')
  })

  it('accepts a body at the limit and rejects one byte over', async () => {
    await expect(
      writeMemory({ userId: f.alice, projectId, path: 'a/ok', body: 'x'.repeat(262144) }),
    ).resolves.toBeTruthy()
    await expect(
      writeMemory({ userId: f.alice, projectId, path: 'a/big', body: 'x'.repeat(262145) }),
    ).rejects.toMatchObject({ code: 'body_too_large' })
  })

  it('strips the summary when a body is rewritten', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/d', body: 'one' })
    await adminPool().query("update memories set summary = 'stale' where path = 'a/d'")
    await writeMemory({ userId: f.alice, projectId, path: 'a/d', body: 'two' })
    expect((await readMemory(f.alice, projectId, 'a/d'))!.summary).toBeNull()
  })

  it('rejects a body with a NUL byte instead of letting postgres raise 22021', async () => {
    await expect(writeMemory({ userId: f.alice, projectId, path: 'nul/x', body: 'a\u0000b' }))
      .rejects.toMatchObject({ code: 'invalid_params' })
  })

  it('lets two concurrent writes to one path settle on one row', async () => {
    await Promise.all([
      writeMemory({ userId: f.alice, projectId, path: 'race/x', body: 'one' }),
      writeMemory({ userId: f.alice, projectId, path: 'race/x', body: 'two' }),
    ])
    const { rows } = await adminPool().query("select body from memories where path = 'race/x'")
    expect(rows).toHaveLength(1)
    expect(['one', 'two']).toContain(rows[0].body)
  })

  it('hides a soft-deleted memory from reads and the tree', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'gone/x', body: 'x' })
    expect(await deleteMemory(f.alice, projectId, 'gone/x')).toBe(true)
    expect(await readMemory(f.alice, projectId, 'gone/x')).toBeNull()
    expect((await treeMemory(f.alice, projectId, '', 3)).map((m) => m.path)).not.toContain('gone/x')
  })

  it('reports false when deleting a path that is not there', async () => {
    expect(await deleteMemory(f.alice, projectId, 'nope/nope')).toBe(false)
  })

  it('refuses a write with only a read grant', async () => {
    await seedGrant(projectId, f.bob, 'read')
    await expect(
      writeMemory({ userId: f.bob, projectId, path: 'x/y', body: 'x' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lets a write grant write but not delete the project content of another owner', async () => {
    await seedGrant(projectId, f.bob, 'write')
    await expect(
      writeMemory({ userId: f.bob, projectId, path: 'x/z', body: 'x' }),
    ).resolves.toMatchObject({ created: true })
    expect(await deleteMemory(f.bob, projectId, 'x/z')).toBe(true)
  })

  it('refuses a read by a stranger without revealing the project exists', async () => {
    await expect(
      readMemory(f.carol, projectId, 'conventions/commits'),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('returns only titles and never bodies from the tree', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/one', body: 'deep body text' })
    const [entry] = await treeMemory(f.alice, projectId, 'deploy', 1)
    expect(entry).toMatchObject({ path: 'deploy/one', title: 'deep body text', hasSummary: false })
    expect(entry).not.toHaveProperty('body')
  })

  it('respects the depth limit when listing', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/b/c/d', body: 'x' })
    expect((await treeMemory(f.alice, projectId, '', 1)).map((m) => m.path)).not.toContain('a/b/c/d')
    expect((await treeMemory(f.alice, projectId, '', 4)).map((m) => m.path)).toContain('a/b/c/d')
  })
})

describe('treeMemory path prefixes', () => {
  it('does not let an underscore act as a wildcard', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a_b/one', body: 'x' })
    await writeMemory({ userId: f.alice, projectId, path: 'axb/two', body: 'x' })

    const entries = await treeMemory(f.alice, projectId, 'a_b', 3)
    expect(entries.map((entry) => entry.path)).toEqual(['a_b/one'])
  })

  it('includes a memory stored at exactly the prefix path', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'x' })
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/runbook', body: 'x' })

    const entries = await treeMemory(f.alice, projectId, 'deploy', 3)
    expect(entries.map((entry) => entry.path).sort()).toEqual(['deploy', 'deploy/runbook'])
  })
})
