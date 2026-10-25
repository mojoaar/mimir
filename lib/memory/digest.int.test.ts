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
