import { describe, expect, it } from 'vitest';

import { backupFailureEmail, inviteEmail, mfaResetEmail, resetEmail } from './templates';

const siteName = 'Mimir';
const link = 'https://mimir.example.test/set-password/abc123';

describe('email templates', () => {
  it('invites a user with the link and the inviter', () => {
    const email = inviteEmail({ siteName, link, invitedBy: 'admin@example.test' });

    expect(email.subject).toContain(siteName);
    expect(email.text).toContain(link);
    expect(email.text).toContain('admin@example.test');
    expect(email.text.endsWith(`- ${siteName}`)).toBe(true);
  });

  it('sends a reset link', () => {
    const email = resetEmail({ siteName, link });

    expect(email.text).toContain(link);
    expect(email.text).toContain(siteName);
    expect(email.text.endsWith(`- ${siteName}`)).toBe(true);
  });

  it('tells a user their second factor was reset', () => {
    const email = mfaResetEmail({ siteName, link });

    expect(email.text).toContain(link);
    expect(email.text.toLowerCase()).toContain('second factor');
  });

  it('reports a failed backup with the reason and the time', () => {
    const when = new Date('2026-10-25T03:00:00Z');
    const email = backupFailureEmail({ siteName, error: 'upload failed: 403', when });

    expect(email.subject.toLowerCase()).toContain('backup');
    expect(email.text).toContain('upload failed: 403');
    expect(email.text).toContain('2026');
  });

  it('never renders undefined into a message', () => {
    const emails = [
      inviteEmail({ siteName, link, invitedBy: 'admin@example.test' }),
      resetEmail({ siteName, link }),
      mfaResetEmail({ siteName, link }),
      backupFailureEmail({ siteName, error: 'boom', when: new Date() }),
    ];

    for (const email of emails) {
      expect(email.subject).not.toContain('undefined');
      expect(email.text).not.toContain('undefined');
    }
  });
});
