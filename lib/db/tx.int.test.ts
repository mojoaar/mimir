import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from './pool'
import { withUser } from './tx'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from './seed'

let fx: Fixtures

beforeAll(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
})

beforeEach(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
})

describe('withUser', () => {
  it('shows a user only their own projects', async () => {
    const mine = await withUser(fx.alice, (tx) =>
      tx.query('select slug from projects order by slug'))
    expect(mine.rows.map((r) => r.slug)).toEqual(['alice-project'])
  })

  it('does not leak the tenant variable to the next borrower', async () => {
    await withUser(fx.alice, async (tx) => { await tx.query('select 1') })
    const leaked = await withUser(fx.bob, (tx) =>
      tx.query("select current_setting('mimir.user_id', true) as uid"))
    expect(leaked.rows[0].uid).toBe(fx.bob)
  })

  it('rolls back on throw', async () => {
    await expect(withUser(fx.alice, async (tx) => {
      await tx.query("insert into projects (owner_user_id, name, slug) values ($1,'x','x')", [fx.alice])
      throw new Error('boom')
    })).rejects.toThrow('boom')
    const { rows } = await adminPool().query("select 1 from projects where slug = 'x'")
    expect(rows).toHaveLength(0)
  })
})
