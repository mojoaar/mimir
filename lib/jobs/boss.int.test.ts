import { afterAll, expect, test, vi } from 'vitest'
import { getBoss, registerWorker, sendJob, startJobs, stopJobs } from './boss'

test('runs a registered worker', async () => {
  const seen: unknown[] = []
  registerWorker('backfill', async (data) => {
    seen.push(data)
  })
  await startJobs()
  const id = await sendJob('backfill', { marker: 'boss-int' })
  expect(id).toBeTruthy()
  // The queue survives between runs, so an older job may arrive first.
  await expect
    .poll(() => seen.some((entry) => (entry as { marker?: string }).marker === 'boss-int'), { timeout: 10_000 })
    .toBe(true)
})

test('is idempotent', async () => {
  await startJobs()
  expect(getBoss()).toBeTruthy()
})

// Next bundles the instrumentation hook and the route handlers separately, so
// each import gets its own module scope. A queue held in module scope is
// therefore invisible to a request handler; resetModules simulates the second
// copy of this file that a request actually gets.
test('shares the started queue with a separately bundled caller', async () => {
  await startJobs()
  vi.resetModules()
  const fresh = await import('./boss')
  // A non-null id is the whole point: before the fix this returned null and
  // every job a route handler queued was dropped without a trace.
  const id = await fresh.sendJob('backfill', { marker: 'second-bundle' })
  expect(id).not.toBeNull()
})

afterAll(async () => {
  await stopJobs()
})
