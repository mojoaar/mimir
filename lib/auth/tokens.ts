import { randomBytes } from 'node:crypto';

import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { sha256 } from '@/lib/crypto';
import { withAdmin, withService } from '@/lib/db/tx';
import { sendEmail } from '@/lib/email/client';
import { inviteEmail, mfaResetEmail, resetEmail } from '@/lib/email/templates';
import { getPublicUrl, getSiteSettings } from '@/lib/settings/site';

export type TokenKind = 'invite' | 'password_reset' | 'mfa_reset';

export const MIN_PASSWORD_LENGTH = 12;
const TOKEN_TTL_MINUTES = 60;

async function tokenUrl(token: string): Promise<string> {
  return `${await getPublicUrl()}/set-password/${token}`;
}

/**
 * Mints a single-use link. Any earlier unused token of the same kind is
 * invalidated first, so "resend invite" cannot leave two working links.
 */
export async function mintToken(
  userId: string,
  kind: TokenKind,
  createdBy: string | null,
): Promise<{ token: string; url: string }> {
  const token = randomBytes(32).toString('base64url');
  const hash = sha256(token);

  await withAdmin(async (client) => {
    await client.query(
      `update tokens set used_at = now()
        where user_id = $1 and kind = $2 and used_at is null`,
      [userId, kind],
    );
    await client.query(
      `insert into tokens (user_id, kind, token_hash, expires_at, created_by)
       values ($1, $2, $3, now() + ($4 || ' minutes')::interval, $5)`,
      [userId, kind, hash, String(TOKEN_TTL_MINUTES), createdBy],
    );
  });

  return { token, url: await tokenUrl(token) };
}

/**
 * Marks a token used and returns its owner. One statement, so two concurrent
 * requests cannot both consume it.
 */
export async function consumeToken(
  token: string,
  kinds: readonly TokenKind[],
): Promise<{ userId: string; kind: TokenKind } | null> {
  const result = await withAdmin((client) =>
    client.query<{ user_id: string; kind: TokenKind }>(
      `update tokens set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
          and kind = any($2::token_kind[])
        returning user_id, kind`,
      [sha256(token), kinds],
    ),
  );

  const row = result.rows[0];
  return row ? { userId: row.user_id, kind: row.kind } : null;
}

/**
 * Mints a link and tries to email it. `emailed: false` is not an error: the
 * admin is shown the URL to pass on by hand, which is how an install without
 * Resend works.
 */
export async function deliverToken(input: {
  userId: string;
  kind: TokenKind;
  email: string;
  siteName: string;
  invitedBy: string;
}): Promise<{ emailed: boolean; url: string }> {
  const { token, url } = await mintToken(input.userId, input.kind, null);

  const template =
    input.kind === 'invite'
      ? inviteEmail({ siteName: input.siteName, link: url, invitedBy: input.invitedBy })
      : input.kind === 'mfa_reset'
        ? mfaResetEmail({ siteName: input.siteName, link: url })
        : resetEmail({ siteName: input.siteName, link: url });

  const sent = await sendEmail({ to: input.email, subject: template.subject, text: template.text });
  if (!sent.ok) {
    console.warn(`mimir: could not email ${input.kind} link (${sent.reason})`);
  }

  return { emailed: sent.ok, url };
}

/**
 * Always resolves. An unknown or disabled address must look exactly like a
 * known one from the outside, so the caller cannot be told which it was.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;

  const user = await withService(async (client) => {
    const result = await client.query<{ id: string; email: string }>(
      `select id, email::text as email
         from users
        where lower(email::text) = $1 and status = 'active'
        limit 1`,
      [address],
    );
    return result.rows[0] ?? null;
  });
  if (!user) return;

  const { siteName } = await getSiteSettings();
  // Mint now, send later: the reply must not take longer for a real account than
  // for an unknown one, so the HTTPS round trip to Resend stays off the response.
  const minted = await mintToken(user.id, 'password_reset', null);
  const template = resetEmail({ siteName, link: minted.url });
  void sendEmail({ to: user.email, subject: template.subject, text: template.text }).then((sent) => {
    if (!sent.ok) console.warn(`mimir: could not email password_reset link (${sent.reason})`);
  });
}

export async function setPasswordWithToken(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'weak' }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'weak' };
  }

  const consumed = await consumeToken(token, ['invite', 'password_reset']);
  if (!consumed) {
    return { ok: false, reason: 'invalid' };
  }

  const hash = await hashPassword(password);

  await withAdmin(async (client) => {
    await client.query(`update users set password_hash = $2 where id = $1`, [consumed.userId, hash]);
    // A reset ends every other session: that is the point of resetting.
    await revokeAllSessions(consumed.userId, client);
  });

  await audit({
    actorType: 'user',
    actorId: consumed.userId,
    action: 'auth.password_set',
    targetType: 'user',
    targetId: consumed.userId,
    detail: { via: consumed.kind },
  });

  return { ok: true };
}
