import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { writeMemory } from '@/lib/memory/service'

// Enqueueing is the whole output of the sweep, so it is what the test watches.
const queue = vi.hoisted(() => ({ extract: vi.fn(), backfill: vi.fn() }))
// A partial mock: the integration config shares a module registry between
// files, so a replacement that omits an export breaks an unrelated suite.
vi.mock('@/lib/jobs/enqueue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jobs/enqueue')>()),
  enqueueExtraction: queue.extract,
  enqueueBackfill: queue.backfill,
}))

const { runReconcile } = await import('./reconcile')

let f: Fixtures
let bobProject: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  queue.extract.mockClear()
  queue.backfill.mockClear()

  const { rows } = await adminPool().query<{ id: string }>(
    'select id from projects where owner_user_id = $1 limit 1',
    [f.bob],
  )
  bobProject = rows[0]?.id as string
})

afterAll(async () => {
  await closePools()
})

describe('the nightly sweep', () => {
  it('asks only for the work that is actually missing', async () => {
    // Alice has a vector but no summary. Bob has a summary but no vector.
    await writeMemory({ userId: f.alice, projectId: f.aliceProjectId, path: 'a/one', body: 'one' })
    await writeMemory({ userId: f.bob, projectId: bobProject, path: 'b/one', body: 'two' })

    await adminPool().query(
      `update memories
          set embedding = array_fill(0.1, array[768])::vector
        where project_id = $1`,
      [f.aliceProjectId],
    )
    await adminPool().query(`update memories set summary = 'done' where project_id = $1`, [bobProject])

    // The writes queued their own extras; the sweep is the only caller now.
    queue.extract.mockClear()
    queue.backfill.mockClear()

    expect(await runReconcile()).toEqual({ projects: 2 })
    expect(queue.extract).toHaveBeenCalledTimes(1)
    expect(queue.extract).toHaveBeenCalledWith(f.aliceProjectId)
    expect(queue.backfill).toHaveBeenCalledTimes(1)
    expect(queue.backfill).toHaveBeenCalledWith(bobProject)
  })

  it('says nothing when there is nothing to do', async () => {
    expect(await runReconcile()).toEqual({ projects: 0 })
    expect(queue.extract).not.toHaveBeenCalled()
    expect(queue.backfill).not.toHaveBeenCalled()
  })
})
