import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { updateMyLocale } from './locale'

let f: Fixtures

async function localeOf(userId: string): Promise<string> {
  const { rows } = await adminPool().query<{ locale: string }>(
    'select locale from users where id = $1',
    [userId],
  )
  return rows[0]?.locale ?? ''
}

async function audits(action: string): Promise<number> {
  const { rows } = await adminPool().query<{ n: string }>(
    'select count(*)::text as n from audit_log where action = $1',
    [action],
  )
  return Number(rows[0]?.n ?? 0)
}

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('your own language', () => {
  it('saves it for you and leaves everyone else alone', async () => {
    await updateMyLocale(f.alice, 'da')

    expect(await localeOf(f.alice)).toBe('da')
    // A new account has chosen nothing yet, so it stays blank and the
    // resolver falls through to the cookie or the browser's language.
    expect(await localeOf(f.bob)).toBe('')
  })

  it('refuses a language the install does not speak', async () => {
    await expect(updateMyLocale(f.alice, 'fr')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await localeOf(f.alice)).toBe('')
  })

  it('records each change', async () => {
    await updateMyLocale(f.alice, 'da')
    await updateMyLocale(f.alice, 'de')

    expect(await audits('account.locale')).toBe(2)
    expect(await localeOf(f.alice)).toBe('de')
  })
})
