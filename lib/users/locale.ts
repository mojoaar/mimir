import { withUser } from '@/lib/db/tx'
import { audit } from '@/lib/audit'
import { isLocale } from '@/lib/i18n/locales'

/**
 * Saves the caller's own language. There is no actor parameter: the id passed
 * in is the whole guard, exactly like lib/users/self.ts.
 */
export async function updateMyLocale(userId: string, locale: string): Promise<void> {
  if (!isLocale(locale)) {
    throw Object.assign(
      new Error('invalid_params: that is not a language this install speaks'),
      { code: 'invalid_params' },
    )
  }

  await withUser(userId, async (client) => {
    await client.query('update users set locale = $2 where id = $1', [userId, locale])
    await audit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'account.locale',
        targetType: 'user',
        targetId: userId,
        detail: { locale },
      },
      client,
    )
  })
}
