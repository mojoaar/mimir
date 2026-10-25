import { beforeEach, describe, expect, it } from 'vitest';

import { adminPool } from '@/lib/db/pool';
import { resetFixtures, seedTwoUsersWithProjects, TEST_PASSWORD, type Fixtures } from '@/lib/db/seed';
import { createSession, resolveSession } from './session';
import { consumeToken, mintToken, requestPasswordReset, setPasswordWithToken } from './tokens';

let f: Fixtures;

describe('tokens', () => {
  beforeEach(async () => {
    await resetFixtures();
    f = await seedTwoUsersWithProjects();
  });

  it('consumes a fresh token exactly once', async () => {
    const { token } = await mintToken(f.alice, 'invite', null);

    expect(await consumeToken(token, ['invite'])).toEqual({ userId: f.alice, kind: 'invite' });
    expect(await consumeToken(token, ['invite'])).toBeNull();
  });

  it('refuses an expired token', async () => {
    const { token } = await mintToken(f.alice, 'invite', null);
    await adminPool().query(`update tokens set expires_at = now() - interval '1 minute'`);

    expect(await consumeToken(token, ['invite'])).toBeNull();
  });

  it('refuses a token of another kind', async () => {
    const { token } = await mintToken(f.alice, 'password_reset', null);

    expect(await consumeToken(token, ['invite'])).toBeNull();
  });

  it('invalidates the previous token of the same kind', async () => {
    const first = await mintToken(f.alice, 'invite', null);
    const second = await mintToken(f.alice, 'invite', null);

    expect(await consumeToken(first.token, ['invite'])).toBeNull();
    expect(await consumeToken(second.token, ['invite'])).toEqual({ userId: f.alice, kind: 'invite' });
  });

  it('refuses a password under the minimum length and keeps the old hash', async () => {
    const { token } = await mintToken(f.alice, 'invite', null);
    const before = await adminPool().query(`select password_hash from users where id = $1`, [f.alice]);

    expect(await setPasswordWithToken(token, 'short-pass1')).toEqual({ ok: false, reason: 'weak' });

    const after = await adminPool().query(`select password_hash from users where id = $1`, [f.alice]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect(await consumeToken(token, ['invite'])).not.toBeNull();
  });

  it('sets a password, revokes sessions and records the change', async () => {
    const session = await createSession(f.alice, {});
    const { token } = await mintToken(f.alice, 'password_reset', null);
    const oldHash = await adminPool().query(`select password_hash from users where id = $1`, [f.alice]);

    expect(await setPasswordWithToken(token, 'a-much-longer-password')).toEqual({ ok: true });

    const row = await adminPool().query(`select password_hash, status from users where id = $1`, [f.alice]);
    expect(row.rows[0].password_hash).not.toBe(oldHash.rows[0].password_hash);
    expect(row.rows[0].status).toBe('active');
    expect(await resolveSession(session.cookieValue)).toBeNull();

    const audit = await adminPool().query(`select action from audit_log where action = 'auth.password_set'`);
    expect(audit.rowCount).toBe(1);
  });

  it('does not accept a used token a second time', async () => {
    const { token } = await mintToken(f.alice, 'invite', null);
    expect(await setPasswordWithToken(token, 'a-much-longer-password')).toEqual({ ok: true });

    expect(await setPasswordWithToken(token, 'another-long-password')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('leaves the seeded password working when a reset is not used', async () => {
    await mintToken(f.alice, 'password_reset', null);
    const { verifyPassword } = await import('./password');
    const row = await adminPool().query(`select password_hash from users where id = $1`, [f.alice]);

    expect(await verifyPassword(row.rows[0].password_hash, TEST_PASSWORD)).toBe(true);
  });

  describe('a forgotten password', () => {
    async function tokensFor(userId: string): Promise<number> {
      const result = await adminPool().query(
        `select count(*)::int as n from tokens where user_id = $1 and kind = 'password_reset'`,
        [userId],
      );
      return result.rows[0].n as number;
    }

    it('mints one link for an active account and says nothing else', async () => {
      expect(await requestPasswordReset('alice@example.test')).toBeUndefined();
      expect(await tokensFor(f.alice)).toBe(1);
    });

    it('mints nothing for an address without an active account', async () => {
      await requestPasswordReset('nobody@example.test');
      await requestPasswordReset('disabled@example.test');

      expect(await tokensFor(f.alice)).toBe(0);
      expect(await tokensFor(f.bob)).toBe(0);
    });

    it('leaves the earlier link dead when asked twice', async () => {
      await requestPasswordReset('alice@example.test');
      await requestPasswordReset('alice@example.test');

      const live = await adminPool().query(
        `select count(*)::int as n from tokens
          where user_id = $1 and kind = 'password_reset' and used_at is null`,
        [f.alice],
      );
      expect(live.rows[0].n).toBe(1);
    });
  });
});
