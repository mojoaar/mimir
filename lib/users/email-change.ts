import { randomBytes } from 'node:crypto'

import { audit } from '@/lib/audit'
import { revokeAllSessions } from '@/lib/auth/session'
import { sha256 } from '@/lib/crypto'
import { withAdmin, withUser } from '@/lib/db/tx'
import { sendEmail } from '@/lib/email/client'
import { emailChangeEmail } from '@/lib/email/templates'
import { getPublicUrl, getSiteSettings } from '@/lib/settings/site'
import { isEmailAddress, verifyCurrentPassword } from '@/lib/users/self'

const TTL_MINUTES = 60

type Failure = Error & { code: 'invalid_params' | 'not_found' }

function fail(code: Failure['code'], message: string): Failure {
  const error = new Error(message) as Failure
  error.code = code
  return error
}

export function confirmEmailUrl(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/confirm-email#${token}`
}

/**
 * Nothing about the account changes here: the new address is only recorded as
 * pending until whoever owns that inbox clicks the link.
 */
export async function requestEmailChange(
  userId: string,
  rawEmail: string,
  currentPassword?: string,
): Promise<{ pending: true }> {
  const email = rawEmail.trim().toLowerCase()
  if (!isEmailAddress(email)) {
    throw fail('invalid_params', 'that does not look like an email address')
  }

  const account = await withUser(userId, async (client) => {
    const { rows } = await client.query<{ email: string; password_hash: string | null }>(
      'select email::text as email, password_hash from users where id = $1',
      [userId],
    )
    const row = rows[0]
    if (!row) throw fail('not_found', 'no such account')
    if (row.email.toLowerCase() === email) {
      throw fail('invalid_params', 'that is already your address')
    }
    const taken = await client.query(
      'select 1 from users where lower(email::text) = $1 and id <> $2',
      [email, userId],
    )
    if (taken.rowCount) throw fail('invalid_params', 'that email is already in use')

    await verifyCurrentPassword(row.email, row.password_hash, currentPassword)
    return row
  })

  const token = randomBytes(32).toString('base64url')
  await withAdmin((client) => {
    // One pending request per account: an earlier link stops working the
    // moment a new one is asked for.
    return client
      .query(`update email_changes set used_at = now() where user_id = $1 and used_at is null`, [
        userId,
      ])
      .then(() =>
        client.query(
          `insert into email_changes (user_id, email, token_hash, expires_at)
           values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
          [userId, email, sha256(token), String(TTL_MINUTES)],
        ),
      )
  })

  const [{ siteName }, publicUrl] = await Promise.all([getSiteSettings(), getPublicUrl()])
  const template = emailChangeEmail({
    siteName,
    email,
    link: confirmEmailUrl(publicUrl, token),
  })
  const sent = await sendEmail({ to: email, subject: template.subject, text: template.text })
  if (!sent.ok) console.warn(`mimir: could not email email_change link (${sent.reason})`)

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'auth.email_change_requested',
    targetType: 'user',
    targetId: userId,
    detail: { email },
  })

  return { pending: true }
}

/**
 * Runs on the admin pool on purpose: the link is opened in whatever browser
 * the inbox is in, often signed out, and the table is RLS-scoped to its owner.
 * The update still names the one user the token matched, so nothing widens.
 */
export async function confirmEmailChange(token: string): Promise<{ email: string }> {
  if (!token) throw fail('invalid_params', 'that link is no longer valid')

  const confirmed = await withAdmin(async (client) => {
    const { rows } = await client.query<{ user_id: string; email: string }>(
      `update email_changes set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
        returning user_id, email`,
      [sha256(token)],
    )
    const row = rows[0]
    if (!row) return null

    await client.query('update users set email = $2 where id = $1', [row.user_id, row.email])
    // The old address can no longer recover the account, so every session
    // that was opened against it ends here.
    await revokeAllSessions(row.user_id, client)
    return row
  })

  if (!confirmed) throw fail('invalid_params', 'that link is no longer valid')

  await audit({
    actorType: 'user',
    actorId: confirmed.user_id,
    action: 'auth.email_changed',
    targetType: 'user',
    targetId: confirmed.user_id,
    detail: { email: confirmed.email },
  })

  return { email: confirmed.email }
}
