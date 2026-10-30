import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({ id: 'u1', email: 'a@b.test', locale: 'da' }),
}));

import { setPasswordUrl } from '@/lib/auth/tokens';

import SetPasswordPage from './page';
import LegacyPage from './[token]/page';

describe('a password link', () => {
  it('carries the token in the fragment, never in the request line', () => {
    expect(setPasswordUrl('https://mimir.test', 'a-token-value')).toBe(
      'https://mimir.test/set-password#a-token-value',
    );
  });

  it('sends the old path form on to the fragment', async () => {
    await expect(
      LegacyPage({ params: Promise.resolve({ token: 'a-token-value' }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('/set-password#a-token-value') });
  });

  it('renders the form without putting a token in the markup', async () => {
    const html = renderToStaticMarkup(await SetPasswordPage());

    expect(html).toContain('name="password"');
    expect(html).not.toContain('a-token-value');
  });
});
