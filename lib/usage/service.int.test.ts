import { beforeEach, expect, test } from 'vitest'
import { withAdmin } from '@/lib/db/tx'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import {
  breakdown,
  daily,
  dismissed,
  dismiss,
  failures,
  hourly,
  people,
  pruneUsage,
  spend,
  spike,
} from './service'

let f: Fixtures

/**
 * One of the two sets the time. `hoursAgo` pins the call halfway into an hour, so
 * a test run at 05:01 and one at 05:59 bucket the same way; `minutesAgo` is for
 * tests that only care about a day or a week.
 */
type Call = {
  minutesAgo?: number
  hoursAgo?: number
  kind?: 'llm' | 'embedding'
  cost?: number | null
  ok?: boolean
  model?: string
  userId?: string | null
}

async function seed(calls: Call[]): Promise<void> {
  for (const call of calls) {
    const pinned = call.hoursAgo !== undefined
    await withAdmin((tx) =>
      tx.query(
        `insert into provider_calls
           (at, user_id, provider_id, preset, model, kind, purpose, prompt_tokens, completion_tokens, cost_micros, status, ok)
         values (case when $1::boolean
                      then date_trunc('hour', now()) - ($2::int * interval '1 hour') + interval '30 minutes'
                      else now() - ($2::int || ' minutes')::interval end,
                 $3, null, 'deepseek', $4, $5, 'extract', 100, 10, $6, $7, $8)`,
        [
          pinned,
          pinned ? call.hoursAgo : (call.minutesAgo ?? 0),
          call.userId === undefined ? f.alice : call.userId,
          call.model ?? 'deepseek-flash',
          call.kind ?? 'llm',
          call.cost === undefined ? 100 : call.cost,
          call.ok === false ? 500 : 200,
          call.ok !== false,
        ],
      ),
    )
  }
}

beforeEach(async () => {
  await withAdmin((tx) => tx.query('delete from provider_calls'))
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

test('splits this month by kind and counts what has no price', async () => {
  await seed([
    { minutesAgo: 5, cost: 100 },
    { minutesAgo: 6, cost: 200, model: 'deepseek-v4-pro' },
    { minutesAgo: 7, kind: 'embedding', cost: 40, model: 'octen-embedding-4b' },
    { minutesAgo: 8, cost: null },
  ])

  expect(await spend('UTC')).toEqual({
    calls: 4,
    llmMicros: 300,
    embeddingMicros: 40,
    unpriced: 1,
  })
})

test('keeps a bar for every quiet day', async () => {
  await seed([{ minutesAgo: 5 }])

  const days = await daily('UTC', 30)

  expect(days).toHaveLength(30)
  expect(days.at(-1)?.micros).toBe(100)
  expect(days.at(-2)?.micros).toBe(0)
})

test('puts a call on the day and hour of the chosen zone', async () => {
  // 23:30 UTC is already tomorrow in Auckland.
  await withAdmin((tx) =>
    tx.query(
      `insert into provider_calls (at, preset, model, kind, purpose, prompt_tokens, completion_tokens, cost_micros, status, ok)
       values (timestamptz '2026-10-26 23:30:00+00', 'deepseek', 'deepseek-flash', 'llm', 'extract', 1, 1, 100, 200, true)`,
    ),
  )

  const utc = await daily('UTC', 400)
  const auckland = await daily('Pacific/Auckland', 400)
  const find = (rows: { day: string; micros: number }[], day: string) =>
    rows.find((row) => row.day === day)?.micros ?? 0

  expect(find(utc, '2026-10-26')).toBe(100)
  expect(find(utc, '2026-10-27')).toBe(0)
  expect(find(auckland, '2026-10-27')).toBe(100)
})

test('keeps an hour slot for every quiet hour', async () => {
  await seed([{ hoursAgo: 0 }, { hoursAgo: 1 }])

  const hours = await hourly('UTC')

  expect(hours).toHaveLength(24)
  expect(hours.at(-1)?.calls).toBe(1)
  expect(hours.at(-2)?.calls).toBe(1)
})

test('reports the current hour when it is far above the quiet week', async () => {
  // Three calls in a quiet hour, three days ago.
  await seed([{ minutesAgo: 3 * 24 * 60 }, { minutesAgo: 3 * 24 * 60 + 1 }, { minutesAgo: 3 * 24 * 60 + 2 }])
  await seed(Array.from({ length: 40 }, () => ({ hoursAgo: 0 })))

  const found = await spike()

  expect(found?.calls).toBe(40)
  expect(found?.median).toBeGreaterThanOrEqual(1)
  expect(found?.hourStart).toMatch(/T\d\d:00:00\.000Z$/)
})

test('stays quiet inside normal volume', async () => {
  await seed([{ minutesAgo: 2 }, { minutesAgo: 3 }])

  expect(await spike()).toBeNull()
})

test('a dismissal hides the spike for that admin only', async () => {
  await seed(Array.from({ length: 40 }, () => ({ hoursAgo: 0 })))
  const found = await spike()
  expect(found).not.toBeNull()

  expect(await dismissed(f.alice, found!.hourStart)).toBe(false)
  await dismiss(f.alice)
  expect(await dismissed(f.alice, found!.hourStart)).toBe(true)
  expect(await dismissed(f.bob, found!.hourStart)).toBe(false)
})

test('breaks the month down by model and by person, and lists failures', async () => {
  await seed([
    { minutesAgo: 5, cost: 500, model: 'deepseek-v4-pro' },
    { minutesAgo: 6, cost: 100 },
    { minutesAgo: 7, userId: f.bob, cost: 100 },
    { minutesAgo: 8, ok: false },
  ])

  const models = await breakdown('UTC')
  expect(models[0]).toMatchObject({ preset: 'deepseek', model: 'deepseek-v4-pro', calls: 1, micros: 500 })

  const users = await people('UTC')
  expect(users.find((row) => row.email === 'alice@example.test')?.calls).toBe(3)
  expect(users.find((row) => row.email === 'bob@example.test')?.calls).toBe(1)

  const failed = await failures()
  expect(failed).toHaveLength(1)
  expect(failed[0]).toMatchObject({ status: 500, model: 'deepseek-flash' })
})

test('prunes only the calls older than the window', async () => {
  await seed([{ minutesAgo: 100 * 24 * 60 }, { minutesAgo: 5 }])

  expect(await pruneUsage(90)).toBe(1)
  const { rows } = await withAdmin((tx) =>
    tx.query<{ count: string }>('select count(*)::text as count from provider_calls'),
  )
  expect(rows[0]?.count).toBe('1')
})
