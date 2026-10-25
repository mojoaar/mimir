import { describe, expect, it } from 'vitest'
import { adminPool, appPool } from './pool'

describe('database roles', () => {
  it('connects as two distinct roles', async () => {
    const app = await appPool.query('select current_user')
    const owner = await adminPool.query('select current_user')
    expect(app.rows[0].current_user).toBe('mimir_app')
    expect(owner.rows[0].current_user).toBe('mimir_owner')
  })

  it('does not let the runtime role create tables', async () => {
    await expect(appPool.query('create table should_fail (id int)')).rejects.toThrow(/permission denied/)
  })
})
