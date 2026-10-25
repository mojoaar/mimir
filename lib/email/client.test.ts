import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: null as { enabled: boolean; from: string; apiKey: string } | null,
}));

vi.mock('@/lib/settings/email-settings', () => ({
  getEmailSettings: async () => mocks.settings,
}));

import { sendEmail } from './client';

describe('sendEmail', () => {
  beforeEach(() => {
    mocks.settings = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when email is not configured', async () => {
    const fetch = vi.fn();

    const result = await sendEmail(
      { to: 'a@b.test', subject: 'Hi', text: 'Hello' },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    );

    expect(result).toEqual({ ok: false, reason: 'email is not configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to resend with the configured sender', async () => {
    mocks.settings = { enabled: true, from: 'mimir@example.test', apiKey: 're_test_key' };
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));

    const result = await sendEmail(
      { to: 'a@b.test', subject: 'Hi', text: 'Hello' },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    );

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(String(init.body)) as { from: string; to: string[]; subject: string; text: string };
    expect(body.from).toBe('mimir@example.test');
    expect(body.to).toEqual(['a@b.test']);
    expect(body.subject).toBe('Hi');
    expect(body.text).toBe('Hello');
  });

  it('reports the status without echoing the response body', async () => {
    mocks.settings = { enabled: true, from: 'mimir@example.test', apiKey: 're_test_key' };
    const fetch = vi.fn(async () => new Response('bad key sk_live_x', { status: 422 }));

    const result = await sendEmail(
      { to: 'a@b.test', subject: 'Hi', text: 'Hello' },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    );

    expect(result).toEqual({ ok: false, reason: 'email provider responded 422' });
    expect(JSON.stringify(result)).not.toContain('sk_live_x');
  });

  it('never throws when the network fails', async () => {
    mocks.settings = { enabled: true, from: 'mimir@example.test', apiKey: 're_test_key' };
    const fetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });

    const result = await sendEmail(
      { to: 'a@b.test', subject: 'Hi', text: 'Hello' },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('ENOTFOUND');
  });
});
