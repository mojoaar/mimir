import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { buildDigest } from './digest'
import { writeMemory } from './service'

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

describe('buildDigest', () => {
  it('lists every title but only five summaries', async () => {
    for (let i = 0; i < 8; i++) {
      await writeMemory({
        userId: f.alice,
        projectId,
        path: `d${i}/m`,
        body: `title ${i}\nL2-MARKER-${i}`,
      })
    }

    const digest = await buildDigest({ userId: f.alice, projectId })

    expect(digest.memoryCount).toBe(8)
    expect((digest.text.match(/^## /gm) ?? []).length).toBe(5)
    expect(digest.text).not.toContain('L2-MARKER')
  })

  it('names a top-level path exactly, not a sliced fragment', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'Deploy notes' })
    await writeMemory({ userId: f.alice, projectId, path: 'readme', body: 'Read me' })

    const digest = await buildDigest({ userId: f.alice, projectId })

    // Both are among the five most recent, so they render as full entries.
    expect(digest.text).toContain('## deploy')
    expect(digest.text).toContain('## readme')
    expect(digest.text).not.toContain('### .')
  })

  it('dates every entry, because age is the point of a digest', async () => {
    for (let i = 0; i < 6; i++) {
      await writeMemory({ userId: f.alice, projectId, path: `d${i}/m`, body: `title ${i}` })
    }
    // Written last, so it is one of the five rendered in full.
    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'Deploy notes' })


    const digest = await buildDigest({ userId: f.alice, projectId })
    const day = new Date().toISOString().slice(0, 10)

    // One full entry and one list line, so both shapes are covered.
    expect(digest.text).toMatch(new RegExp(`^## deploy \\(${day}\\)$`, 'm'))
    expect(digest.text).toMatch(new RegExp(` - title 0 · ${day}$`, 'm'))
  })

  it('lists a procedure first, even when it is the oldest', async () => {
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'runbooks/rotate-keys',
      title: 'Rotate the signing keys',
      body: 'step one',
      kind: 'procedure',
    })
    for (let i = 0; i < 7; i++) {
      await writeMemory({ userId: f.alice, projectId, path: `d${i}/m`, body: `title ${i}` })
    }

    const digest = await buildDigest({ userId: f.alice, projectId })

    // A runbook is valid until it is replaced, not until it is old.
    expect(digest.text.startsWith('### Procedures')).toBe(true)
    expect(digest.text.match(/runbooks\/rotate-keys/g)).toHaveLength(1)
  })

  it('respects the token budget and says it truncated', async () => {
    for (let i = 0; i < 12; i++) {
      await writeMemory({ userId: f.alice, projectId, path: `d${i}/m`, body: 'word '.repeat(40) })
    }

    const digest = await buildDigest({ userId: f.alice, projectId, budgetTokens: 20 })

    expect(digest.text.length).toBeLessThanOrEqual(80)
    expect(digest.truncated).toBe(true)
    expect(digest.memoryCount).toBeLessThan(12)
  })

  it('returns an empty string for an empty project', async () => {
    const digest = await buildDigest({ userId: f.alice, projectId })
    expect(digest.text).toBe('')
    expect(digest.truncated).toBe(false)
  })

  it('refuses a project the user cannot read', async () => {
    await expect(buildDigest({ userId: f.bob, projectId })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
