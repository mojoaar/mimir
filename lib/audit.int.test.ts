import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from './db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from './db/seed'
import { audit } from './audit'

let fx: Fixtures

beforeEach(async () => {
  await resetFixtures()
  fx = await seedTwoUsersWithProjects()
})

describe('audit', () => {
  it('records an entry with redacted detail', async () => {
    await audit({
      actorType: 'user',
      actorId: fx.alice,
      action: 'provider.update',
      detail: { api_key: 'sk-live-abcdef123456' },
    })
    const { rows } = await adminPool().query(
      "select detail from audit_log where action = 'provider.update'",
    )
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0].detail)).not.toContain('sk-live-abcdef123456')
  })

  it('refuses to update or delete an existing row', async () => {
    // The trigger is FOR EACH ROW, so it only fires when a row matches:
    // an empty table would let the update succeed and prove nothing.
    await audit({ actorType: 'system', actorId: null, action: 'backup.run' })
    await expect(adminPool().query("update audit_log set action = 'x'")).rejects.toThrow(/append-only/)
    await expect(adminPool().query('delete from audit_log')).rejects.toThrow(/append-only/)
  })

  it('does not throw when the insert fails', async () => {
    // A foreign actor id violates the uuid cast, which must not escape.
    await expect(
      audit({ actorType: 'user', actorId: 'not-a-uuid', action: 'auth.login' }),
    ).resolves.toBeUndefined()
  })
})
