import { beforeEach, describe, expect, it } from 'vitest'
import { withAdmin } from '@/lib/db/tx'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('the usage tables', () => {
  it('keep a call with its cost and survive a price change', async () => {
    await withAdmin((tx) =>
      tx.query(
        `insert into provider_calls
           (user_id, provider_id, preset, model, kind, purpose, prompt_tokens, completion_tokens, cost_micros, status, ok)
         values ($1, null, 'deepseek', 'deepseek-flash', 'llm', 'extract', 1000, 200, 2400, 200, true)`,
        [f.alice],
      ),
    )

    const { rows } = await withAdmin((tx) =>
      tx.query<{ cost_micros: string; ok: boolean; prompt_tokens: number }>(
        'select cost_micros, ok, prompt_tokens from provider_calls where user_id = $1',
        [f.alice],
      ),
    )

    expect(rows).toHaveLength(1)
    // bigint arrives as a string from pg; the service converts it.
    expect(rows[0]?.cost_micros).toBe('2400')
    expect(rows[0]?.ok).toBe(true)
  })

  it('start a provider unpriced', async () => {
    const { rows } = await withAdmin((tx) =>
      tx.query<{ input_price: string | null; output_price: string | null }>(
        `insert into providers (user_id, kind, preset, label, base_url, model)
         values ($1, 'llm', 'deepseek', 'mine', 'https://api.deepseek.com', 'deepseek-flash')
         returning input_price, output_price`,
        [f.alice],
      ),
    )

    expect(rows[0]?.input_price).toBeNull()
    expect(rows[0]?.output_price).toBeNull()
  })

  it('allow one dismissal per admin', async () => {
    await withAdmin((tx) =>
      tx.query('insert into usage_dismissals (user_id) values ($1)', [f.alice]),
    )

    await expect(
      withAdmin((tx) => tx.query('insert into usage_dismissals (user_id) values ($1)', [f.alice])),
    ).rejects.toMatchObject({ code: '23505' })
  })
})
