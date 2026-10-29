import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import {
  deleteMemory,
  listDeletedMemories,
  purgeDeletedMemories,
  readMemory,
  restoreMemory,
  treeMemory,
  writeMemory,
} from './service'

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
  it('leaves the embedding stamp empty when no provider is configured', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/plain', body: 'no vector here' })

    const { rows } = await adminPool().query<{
      embedded_at: Date | null
      embedding_model: string | null
      embedding: string | null
    }>(
      `select embedded_at, embedding_model, embedding::text as embedding
         from memories where project_id = $1 and path = 'a/plain'`,
      [projectId],
    )
    expect(rows[0]?.embedding).toBeNull()
    expect(rows[0]?.embedded_at).toBeNull()
    expect(rows[0]?.embedding_model).toBeNull()
  })

  it('remembers which client and session wrote a memory', async () => {
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'a/one',
      body: 'one',
      client: 'opencode',
      session: 'ses_abc',
    })

    const found = await readMemory(f.alice, projectId, 'a/one')

    expect(found?.client).toBe('opencode')
    expect(found?.session).toBe('ses_abc')
  })

  it('stores no blank writer, because an empty string is not an answer', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/two', body: 'two', client: '  ', session: '' })

    const found = await readMemory(f.alice, projectId, 'a/two')

    expect(found?.client).toBeNull()
    expect(found?.session).toBeNull()
  })

  it('trims the client and caps the session id', async () => {
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'a/three',
      body: 'three',
      client: ' opencode ',
      session: 'x'.repeat(200),
    })

    const found = await readMemory(f.alice, projectId, 'a/three')

    expect(found?.client).toBe('opencode')
    expect(found?.session).toHaveLength(128)
  })

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

  it('clears the summary on a rewrite and records exactly one version', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'conventions/summarised', body: 'first' })
    await adminPool().query('update memories set summary = $1 where project_id = $2', [
      'a summary',
      projectId,
    ])

    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'conventions/summarised',
      body: 'second',
    })

    const { listVersions } = await import('./versions')
    expect((await readMemory(f.alice, projectId, 'conventions/summarised'))!.summary).toBeNull()
    expect(await listVersions(f.alice, projectId, 'conventions/summarised')).toHaveLength(1)
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

  it('lists and restores a deleted memory', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'gone/x', body: 'Original body' })
    await deleteMemory(f.alice, projectId, 'gone/x')

    const deleted = await listDeletedMemories(f.alice, projectId)
    expect(deleted.map((row) => row.path)).toContain('gone/x')
    await writeMemory({ userId: f.alice, projectId, path: 'keep/y', body: 'live' })
    expect((await listDeletedMemories(f.alice, projectId)).map((row) => row.path)).not.toContain('keep/y')

    expect(await restoreMemory(f.alice, projectId, 'gone/x')).toEqual({ restored: true })
    expect((await readMemory(f.alice, projectId, 'gone/x'))?.body).toBe('Original body')
  })

  it('refuses to restore over a live memory at the same path', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/x', body: 'old' })
    await deleteMemory(f.alice, projectId, 'a/x')
    await writeMemory({ userId: f.alice, projectId, path: 'a/x', body: 'new' })

    expect(await restoreMemory(f.alice, projectId, 'a/x')).toEqual({
      restored: false,
      reason: 'conflict',
    })
    expect((await readMemory(f.alice, projectId, 'a/x'))?.body).toBe('new')
  })

  it('reports a restore of something that never existed', async () => {
    expect(await restoreMemory(f.alice, projectId, 'never/was')).toEqual({
      restored: false,
      reason: 'not_found',
    })
  })

  it('lets a read grantee look at the bin but not empty it', async () => {
    await seedGrant(projectId, f.bob, 'read')
    await writeMemory({ userId: f.alice, projectId, path: 'a/bin', body: 'x' })
    await deleteMemory(f.alice, projectId, 'a/bin')

    expect((await listDeletedMemories(f.bob, projectId)).map((row) => row.path)).toContain('a/bin')
    await expect(restoreMemory(f.bob, projectId, 'a/bin')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('purges only what is past its window', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/old', body: 'old' })
    await writeMemory({ userId: f.alice, projectId, path: 'a/live', body: 'live' })
    await deleteMemory(f.alice, projectId, 'a/old')

    expect(await purgeDeletedMemories()).toEqual({ removed: 0 })
    expect(await purgeDeletedMemories(new Date(Date.now() + 31 * 86_400_000))).toEqual({ removed: 1 })

    const { rows } = await adminPool().query<{ n: string }>(
      'select count(*)::text as n from memories where project_id = $1',
      [projectId],
    )
    expect(rows[0]?.n).toBe('1')
  })
})

describe('treeMemory order', () => {
  it('orders by when a memory was first written, and by when it changed', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'alpha/old', body: 'a' })
    await writeMemory({ userId: f.alice, projectId, path: 'zulu/new', body: 'b' })
    // created_at is never touched by the upsert, so backdating it is a genuine "added".
    await adminPool().query(
      `update memories set created_at = now() - interval '2 days', updated_at = now() - interval '2 days'
        where path = 'alpha/old'`,
    )
    await writeMemory({ userId: f.alice, projectId, path: 'alpha/old', body: 'a again' })

    const byPath = await treeMemory(f.alice, projectId, '', 12)
    const byAdded = await treeMemory(f.alice, projectId, '', 12, 'added')
    const byUpdated = await treeMemory(f.alice, projectId, '', 12, 'updated')

    expect(byPath.map((entry) => entry.path)).toEqual(['alpha/old', 'zulu/new'])
    expect(byAdded.map((entry) => entry.path)).toEqual(['zulu/new', 'alpha/old'])
    expect(byUpdated.map((entry) => entry.path)).toEqual(['alpha/old', 'zulu/new'])
    expect(byAdded[0]?.createdAt).toBeInstanceOf(Date)
  })
})
