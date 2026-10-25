import { afterAll, expect, test } from 'vitest'
import { getBoss, registerWorker, sendJob, startJobs, stopJobs } from './boss'

test('runs a registered worker', async () => {
  const seen: unknown[] = []
  registerWorker('backfill', async (data) => {
    seen.push(data)
  })
  await startJobs()
  const id = await sendJob('backfill', { marker: 'boss-int' })
  expect(id).toBeTruthy()
  await expect.poll(() => seen.length, { timeout: 10_000 }).toBe(1)
  expect(seen[0]).toEqual({ marker: 'boss-int' })
})

test('is idempotent', async () => {
  await startJobs()
  expect(getBoss()).toBeTruthy()
})

afterAll(async () => {
  await stopJobs()
})
